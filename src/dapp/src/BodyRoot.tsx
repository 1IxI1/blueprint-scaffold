import {
  Box,
  Button,
  Center,
  Fade,
  Flex,
  HStack,
  Input,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Tab,
  TabList,
  Tabs,
  useDisclosure,
} from "@chakra-ui/react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActionCard, ParamsWithValue } from "./components/ActionCard";
import Switch from "./components/Switch";
import { Executor } from "./genTxByWrapper";
import { Address } from "@ton/core";
import { WrappersConfig, WrappersData } from "./utils/wrappersConfigTypes";

import "./fade.scss";
import "./tabs.scss";
import { loadWrappersFromJSON } from "./utils/loadWrappers";
import { useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";
import { ChevronDownIcon } from "@chakra-ui/icons";

const noMethod = "Select method";

interface BodyRootProps {
  areGetMethods: boolean;
  setIsGetMethods: React.Dispatch<React.SetStateAction<boolean>>;
  wrapperFromUrl?: string;
  methodFromUrl?: string;
  addressFromUrl?: string;
}

function BodyRoot(props: BodyRootProps) {
  const [wrappers, setWrappers] = useState<WrappersData | null>(null);
  const [wrappersConfig, setWrappersConfig] = useState<WrappersConfig | null>(null);
  const [destAddr, setDestAddr] = useState<string>("");
  const [configAddress, setConfigAddress] = useState<Address | null>(null);
  const [addressError, setAddressError] = useState<boolean>(false);
  const [addrTouched, setAddrTouched] = useState<boolean>(false);
  const [wrapper, setWrapper] = useState<string>("");
  const [method, setMethod] = useState<string>(noMethod);
  const [hasDeploy, setHasDeploy] = useState<boolean>(false);
  const [actionCardKey, setActionCardKey] = useState<string>(""); // to rerender ActionCard
  const inputRef = useRef<HTMLInputElement>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [wrapperTabIndex, setWrapperTabIndex] = useState<number>(0);
  const [methodTabIndex, setMethodTabIndex] = useState<number>(0);
  const [urlValidWrapper, setUrlValidWrapper] = useState<string | null>(null);
  const [urlValidMethod, setUrlValidMethod] = useState<string | null>(null);

  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftShadow, setShowLeftShadow] = useState(false);
  const [showRightShadow, setShowRightShadow] = useState(true);

  const [tcUI] = useTonConnectUI();
  // tcUI's wallet doesn't calls useEffect for some reason
  const wallet = useTonWallet();
  const [executor, setExecutor] = useState<Executor | null>(null);

  const handleScroll = () => {
    // First tabs container
    const container1 = tabsContainerRef.current;
    if (container1) {
      const scrollLeft1 = container1.scrollLeft;
      const scrollWidth1 = container1.scrollWidth;
      const clientWidth1 = container1.clientWidth;

      if (scrollLeft1 === 0) {
        setShowLeftShadow(false);
        setShowRightShadow(true);
      } else if (scrollLeft1 + clientWidth1 === scrollWidth1) {
        setShowLeftShadow(true);
        setShowRightShadow(false);
      } else {
        setShowLeftShadow(true);
        setShowRightShadow(true);
      }

      if (scrollWidth1 == clientWidth1 && scrollWidth1 > 0) {
        setShowRightShadow(false);
      }
    }
  };
  useEffect(() => {
    const container1 = tabsContainerRef.current;
    if (container1) container1.addEventListener("scroll", handleScroll);
    return () => {
      if (container1) container1.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    const updateExecutor = async () => {
      setExecutor(await Executor.createFromUI(tcUI));
    };
    updateExecutor();
  }, [wallet]);

  const checkUrlParams = (_wrappers = wrappers) => {
    if (_wrappers)
      if (props.wrapperFromUrl && props.wrapperFromUrl in _wrappers) {
        setUrlValidWrapper(props.wrapperFromUrl);
        if (props.methodFromUrl && props.methodFromUrl in _wrappers[props.wrapperFromUrl][methods()]) {
          setUrlValidMethod(props.methodFromUrl);
          return [props.wrapperFromUrl, props.methodFromUrl];
        }
        return [props.wrapperFromUrl, undefined];
      }
    return [undefined, undefined];
  };
  useEffect(() => {
    checkUrlParams();
  }, [wrappers]);

  const preloadWrappers = useCallback(async () => {
    // caching wrappers raw file to reload it on switching
    // from get to send or versa.
    // because some we remove some wrappers with no send/get methods.
    const [parsedWrappers, parsedConfig] = await loadWrappersFromJSON();
    return { parsedWrappers, parsedConfig };
  }, []);

  useEffect(() => {
    async function loadWrappers() {
      const { parsedWrappers, parsedConfig } = await preloadWrappers();
      var _wrappers = parsedWrappers;

      // remove wrappers with no send/get methods
      for (const _wrapper in parsedWrappers) {
        if (Object.keys(parsedWrappers[_wrapper][methods()]).length === 0) {
          delete _wrappers[_wrapper];
        }
      }

      setWrappers(_wrappers);
      setWrappersConfig(parsedConfig);

      const [wrapperFromUrl, methodFromUrl] = checkUrlParams(_wrappers);
      const wrapperName =
        wrapperFromUrl || (Object.keys(_wrappers).includes(wrapper) ? wrapper : Object.keys(_wrappers)[0]);

      // sendDeploy should not be shown in sends, and it cannot present in get methods.
      const _hasDeploy = "sendDeploy" in parsedWrappers[wrapperName][methods()];
      setHasDeploy(_hasDeploy);

      const _methods = Object.keys(_wrappers[wrapperName][methods()]);
      // const methodName = methodFromUrl || _methods[_hasDeploy ? 1 : 0];
      const methodName = methodFromUrl || noMethod;

      // if method change (compare to prev state) then correctly update tabs
      if (method.slice(0, 2) !== methodName.slice(0, 2) && method !== "") {
        let wrapperTab = Object.keys(_wrappers).indexOf(wrapper);
        if (wrapperTab === -1) wrapperTab = 0;
        setWrapperTabIndex(wrapperTab);
        // yeah, its may be -1 - that means no method and "Select method" in selector
        setMethodTabIndex(_methods.indexOf(methodName));
      }

      setWrapper(wrapperName);
      setMethod(methodName);
    }

    loadWrappers();
    onOpen();
    handleScroll();
  }, [props.areGetMethods]);

  useEffect(() => {
    // try to set config address, if fail, try
    // provided with address=EQaddr, if fail, try
    // set provided with WrapperName=EQaddr
    if (wrappers && wrappersConfig) {
      try {
        setConfigAddress(Address.parse(wrappersConfig[wrapper]["defaultAddress"]));
      } catch {
        const url = new URL(window.location.href);
        const searchParams = url.searchParams;
        const providedAddress = searchParams.get(wrapper);
        try {
          setConfigAddress(Address.parse(props.addressFromUrl || ""));
        } catch {
          try {
            setConfigAddress(Address.parse(providedAddress || ""));
          } catch {
            setConfigAddress(null);
          }
        }
      }
    }
    handleScroll();
  }, [wrappers, wrapper]);

  useEffect(() => {
    if (destAddr) {
      setAddrTouched(true);
      try {
        Address.parse(destAddr);
        setAddressError(false);
      } catch {
        setAddressError(true);
      }
      return;
    }
    setAddressError(false);
  }, [destAddr]);

  const buildAndExecute = async (isGet: boolean, methodName: string, params: ParamsWithValue) => {
    // builds parameters for running a method and executes it, with giving the result

    if (!wrappers) throw new Error("Wrappers are empty, not loaded?");
    if (!executor) throw new Error("No executor");
    // should not happen ^^

    if ((addressError || !destAddr) && !configAddress) {
      console.warn("no address, highlighting input");
      setAddrTouched(true);
      inputRef.current?.focus();
      return;
    }
    if (methodName === "sendDeploy") {
      const deployData = wrappers[wrapper]["deploy"];
      if (deployData["codeHex"] && deployData["configType"]) {
        return await executor.deploy(
          wrappers[wrapper]["path"],
          wrapper,
          params,
          deployData["configType"],
          deployData["codeHex"]
        );
      } else throw new Error("Deploy data is missing");
    }
    const executeParams = [
      configAddress || Address.parse(destAddr),
      wrappers[wrapper]["path"],
      wrapper,
      methodName,
      params,
    ] as const;

    console.log(configAddress?.toString() || Address.parse(destAddr));
    if (isGet) return await executor.get(...executeParams);

    await executor.send(...executeParams);
  };

  const tabNameFromConfig = (methodName: string) => {
    if (wrappersConfig && wrapper in wrappersConfig && methodName in wrappersConfig[wrapper][methods()])
      return wrappersConfig[wrapper][methods()][methodName]["tabName"];
    else return "";
  };

  const methods = () => (props.areGetMethods ? "getFunctions" : "sendFunctions");

  return (
    <>
      <Box bg="#F7F9FB">
        {urlValidWrapper === null && (
          <Center>
            <Box maxW={["95%", "82%", "70%", "70%"]} mx="auto" mt={["2", "-2", "-2", "-2"]} overflow="hidden">
              <Box
                overflowX="auto"
                overflowY="hidden"
                whiteSpace="nowrap"
                position="relative"
                className="tabs-wrapper"
                _after={leftShadowStyle(showLeftShadow)}
                _before={rightShadowStyle(showRightShadow)}
              >
                <Tabs
                  colorScheme={props.areGetMethods ? "green" : "blue"}
                  color="blue"
                  variant="solid-rounded"
                  index={wrapperTabIndex}
                  onChange={(n) => setWrapperTabIndex(n)}
                >
                  <TabList
                    className="tabs-container"
                    ref={tabsContainerRef}
                    position="relative"
                    display="flex"
                    flexWrap="nowrap"
                    height="50px"
                    alignItems="center"
                  >
                    {wrappers &&
                      wrappersConfig &&
                      Object.keys(wrappers).map((wrapperName) => {
                        const tabName =
                          wrapperName in wrappersConfig
                            ? wrappersConfig[wrapperName]["tabName"] || wrapperName
                            : wrapperName;
                        return (
                          <Tab
                            sx={tabTextStyle}
                            key={wrapperName}
                            onClick={() => {
                              onClose();
                              setWrapper(wrapperName);
                              console.log("set wrapper in OnClick:", wrapperName);
                              const _hasDeploy = "sendDeploy" in wrappers[wrapperName][methods()];
                              setHasDeploy(_hasDeploy);
                              const methodName = Object.keys(wrappers[wrapperName][methods()])[_hasDeploy ? 1 : 0];
                              setMethod(noMethod);
                              setDestAddr("");
                              setAddrTouched(false);
                              setActionCardKey(methodName);
                              setMethodTabIndex(-1);
                              setTimeout(() => onOpen(), 150);
                            }}
                          >
                            {tabName}
                          </Tab>
                        );
                      })}
                  </TabList>
                </Tabs>
              </Box>
            </Box>
          </Center>
        )}
        {!configAddress && (
          <Center>
            <Flex align="center" maxWidth={["85%", "60%", "38%", "38%"]} mb="4" mt="2" alignItems="center">
              <Input
                ref={inputRef}
                isInvalid={destAddr ? addressError : addrTouched}
                mr={hasDeploy ? "2" : "0"}
                bg="white"
                placeholder="Contract Address"
                rounded="100"
                size="md"
                value={destAddr}
                onChange={(e) => setDestAddr(e.target.value)}
                onClick={() => setAddrTouched(true)}
              ></Input>
              {hasDeploy && (
                <>
                  or
                  <Button
                    ml="2"
                    size="sm"
                    px="6"
                    onClick={() => {
                      onClose();
                      setMethod("sendDeploy");
                      setActionCardKey("sendDeploy");
                      setConfigAddress(Address.parse("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"));
                      setTimeout(() => onOpen(), 100);
                    }}
                  >
                    Deploy new
                  </Button>
                </>
              )}
            </Flex>
          </Center>
        )}

        {urlValidMethod === null && (
          <Center>
            <HStack mt="1" mb="5">
              <Switch setToParent={props.setIsGetMethods} />
              <Menu>
                <MenuButton
                  as={Button}
                  transition="all 0.2s"
                  borderWidth="1px"
                  colorScheme="gray"
                  backgroundColor="transparent"
                  minHeight="10"
                  minWidth="250"
                  rounded="xl"
                  whiteSpace="nowrap"
                  px="2"
                  // align="center"
                  textAlign="left"
                  alignItems="center"
                  rightIcon={<ChevronDownIcon />}
                >
                  {tabNameFromConfig(method) || method}
                </MenuButton>
                <MenuList>
                  {wrappers &&
                    wrappersConfig &&
                    wrappers[wrapper] &&
                    wrappers[wrapper][methods()] &&
                    Object.keys(wrappers[wrapper][methods()]).map((methodName) => {
                      if (methodName === "sendDeploy") return null;
                      const tabName = tabNameFromConfig(methodName) || methodName;
                      return (
                        <MenuItem
                          sx={tabTextStyle}
                          key={methodName}
                          onClick={() => {
                            onClose();
                            setMethod(methodName);
                            setConfigAddress(null);
                            setActionCardKey(methodName);
                            setTimeout(() => onOpen(), 100);
                          }}
                        >
                          {tabName}
                        </MenuItem>
                      );
                    })}
                </MenuList>
              </Menu>
            </HStack>
          </Center>
        )}
        {wrappers && wrappersConfig && method in wrappers[wrapper][methods()] && (
          <Fade in={isOpen} unmountOnExit>
            <Box>
              <ActionCard
                visible={actionCardKey !== noMethod}
                key={actionCardKey}
                methodName={method}
                isGet={props.areGetMethods}
                methodParams={wrappers[wrapper][methods()][method]}
                buildAndExecute={buildAndExecute}
                deploy={wrappers[wrapper]["deploy"]}
                methodConfig={wrappersConfig[wrapper][methods()][method]}
                definedTypes={wrappers[wrapper].definedTypes}
              />
            </Box>
          </Fade>
        )}
      </Box>
    </>
  );
}

const tabTextStyle = {
  fontFamily: "Inter",
  fontWeight: "500",
  fontSize: "14px",
};

const shadowStyle = {
  content: '""',
  position: "absolute",
  top: "0",
  bottom: "0",
  width: "40px",
  pointerEvents: "none",
  transition: "opacity 0.3s, left 0.3s",
  zIndex: "1",
};

const rightShadowStyle = (showRightShadow: boolean) => {
  return {
    ...shadowStyle,
    right: "0",
    opacity: showRightShadow ? "1" : "0",
    background: "linear-gradient(to right, transparent, #f7f9fb)",
  };
};

const leftShadowStyle = (showLeftShadow: boolean) => {
  return {
    ...shadowStyle,
    left: "0",
    opacity: showLeftShadow ? "1" : "0",
    background: "linear-gradient(to left, transparent, #f7f9fb)",
  };
};

export default BodyRoot;
