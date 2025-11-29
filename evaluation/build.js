#!/usr/bin/env node

/**
 * Build script for evaluation tools
 *
 * This script uses esbuild to bundle the evaluation scripts with their dependencies.
 * - Bundles evaluation utilities and examples utilities inline
 * - Imports from the compiled library in ../dist/
 * - Keeps external dependencies (ollama, openai, node built-ins) as external
 */

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

// Evaluation scripts to bundle
const entryPoints = [
  'token-comparison-standard.ts',
  'token-comparison-interactive-ollama.ts',
  'token-comparison-standard-openrouter.ts',
  'token-comparison-interactive-openrouter.ts',
];

// Output directory
const outDir = path.join(__dirname, 'dist');

// Create output directory if it doesn't exist
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Build configuration
const buildConfig = {
  entryPoints: entryPoints.map(file => path.join(__dirname, file)),
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outdir: outDir,
  sourcemap: true,
  outExtension: { '.js': '.js' },

  // External dependencies
  external: [
    // Node built-ins
    'fs', 'path', 'child_process', 'events', 'stream', 'util', 'os',
    // NPM packages that should remain external
    'ollama',
    'openai',
    // MCP SDK and project dependencies
    '@modelcontextprotocol/sdk',
    'eventemitter3',
    'nanoid',
    'node-cache',
    'xstate',
  ],

  // Plugin to resolve ../src/ imports to ../dist/
  plugins: [{
    name: 'resolve-src-to-dist',
    setup(build) {
      build.onResolve({ filter: /^\.\.\/src\// }, args => {
        const resolved = args.path.replace(/^\.\.\/src\//, '../dist/');
        return {
          path: resolved,
          external: true,
        };
      });
    },
  }],
};

// Run the build
async function build() {
  console.log('Building evaluation scripts...');
  console.log(`Output directory: ${outDir}`);
  console.log(`Entry points: ${entryPoints.length} files`);
  console.log('');

  try {
    const result = await esbuild.build(buildConfig);

    console.log('✓ Build completed successfully!');
    console.log('');
    console.log('Built files:');
    entryPoints.forEach(file => {
      const outFile = file.replace('.ts', '.js');
      console.log(`  - evaluation/dist/${outFile}`);
    });

    if (result.warnings.length > 0) {
      console.log('');
      console.log('Warnings:');
      result.warnings.forEach(warning => {
        console.log(`  - ${warning.text}`);
      });
    }
  } catch (error) {
    console.error('✗ Build failed:');
    console.error(error);
    process.exit(1);
  }
}

build();
