if [ "$#" -ne 1 ]; then
    echo "Need path to some blueprint project to copy files from."
    exit 1
fi

cp -r $1/dapp src/
rm -rf src/dapp/node_modules
rm -r src/dapp/build/
rm -r src/dapp/dist/
rm -r src/dapp/src/wrappers/*
rm src/dapp/public/config.json
rm src/dapp/public/wrappers.json

sed -i '' '2s/.*/REACT_APP_TITLE='\''My Contract'\''/' src/dapp/.env
