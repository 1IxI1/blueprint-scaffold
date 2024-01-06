import * as fs from 'fs/promises';
import * as path from 'path';
import { parse } from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import { ImportDeclaration } from '@babel/types';

// can't do it async because of babel + traverse
const parseFile = async (filePath: string) => {
  const content = await fs.readFile(filePath, 'utf-8');
  return parse(content, {
    sourceType: 'module',
    plugins: ['typescript'],
  });
};

const findImportPaths = async (filePath: string, baseDir: string): Promise<string[]> => {
  const ast = await parseFile(filePath);
  let importPaths: string[] = [];

  traverse(ast, {
    ImportDeclaration: ({ node }: NodePath<ImportDeclaration>) => {
      const importPath = node.source.value;
      const fullPath = path.resolve(baseDir, path.dirname(filePath), importPath);
      importPaths.push(fullPath);
    },
  });

  return importPaths;
};

// recursive function that travels through imports
const processFile = async (filePath: string, baseDir: string, visited: Set<string>): Promise<Set<string>> => {
  if (visited.has(filePath)) return new Set();
  visited.add(filePath);

  let files: Set<string> = new Set();
  files.add(filePath);
  const importPaths = await findImportPaths(filePath, baseDir);

  // try to check if files exist and go deeper in recursion
  for (let importPath of importPaths) {
    const resolvedPath = importPath + '.ts';
    try {
      await fs.access(resolvedPath);
      const newFiles = await processFile(resolvedPath, baseDir, visited);
      files = new Set([...files, ...newFiles]);
      break;
    } catch (error) {
      // file doesn't "bexist - unexpected behaviour - but continue
    }
  }

  return files;
};

export async function findImports(entryFile: string, baseDir: string): Promise<string[]> {
  const visited = new Set<string>();
  const importsSet = await processFile(entryFile, baseDir, visited);
  return Array.from(importsSet);
}

export async function findImportsOfList(fileList: string[], baseDir: string): Promise<string[]> {
  // returns a list of imports that each file depends on in some directory/project

  // `allImports` will be the result - convert it to list at the end
  // `visited` is a cache set - for `processFile` function - to avoid loops
  let allImports = new Set<string>();
  const visited = new Set<string>();

  for (let file of fileList) {
    const fileImports = await processFile(file, baseDir, visited);
    allImports = new Set([...allImports, ...fileImports]);
  }

  return Array.from(allImports);
}
