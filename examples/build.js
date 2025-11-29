#!/usr/bin/env node

/**
 * Build script for examples
 *
 * This script uses esbuild to bundle the example executables with their dependencies.
 * - Bundles utility files (terminal-ui, tools) inline
 * - Imports from the compiled library in ../dist/
 * - Keeps external dependencies (ollama, @modelcontextprotocol/sdk, etc.) as external
 */

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

// Example executables to bundle
const entryPoints = [
  {
    in: 'clients/ollama-chat-client.ts',
    out: 'clients/ollama-chat-client',
  },
  {
    in: 'servers/stdio-server.ts',
    out: 'servers/stdio-server',
  },
  {
    in: 'servers/standard-mcp-server.ts',
    out: 'servers/standard-mcp-server',
  },
];

// Output directory
const outDir = path.join(__dirname, 'dist');

// Create output directory structure if it doesn't exist
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}
if (!fs.existsSync(path.join(outDir, 'clients'))) {
  fs.mkdirSync(path.join(outDir, 'clients'), { recursive: true });
}
if (!fs.existsSync(path.join(outDir, 'servers'))) {
  fs.mkdirSync(path.join(outDir, 'servers'), { recursive: true });
}

// Build configuration
const buildConfig = {
  entryPoints: entryPoints.map(ep => ({
    in: path.join(__dirname, ep.in),
    out: ep.out,
  })),
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outdir: outDir,
  sourcemap: true,

  // Add shebang line to output files
  banner: {
    js: '#!/usr/bin/env node',
  },

  // External dependencies
  external: [
    // Node built-ins
    'fs', 'path', 'child_process', 'events', 'stream', 'util', 'os', 'readline',
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

  // Plugin to resolve ../src/ imports to ../../../dist/
  // From examples/dist/servers/, we need to go up 3 levels to reach project root
  plugins: [{
    name: 'resolve-src-to-dist',
    setup(build) {
      build.onResolve({ filter: /^\.\.\/\.\.\/src\// }, args => {
        const resolved = args.path.replace(/^\.\.\/\.\.\/src\//, '../../../dist/');
        return {
          path: resolved,
          external: true,
        };
      });
    },
  }],
};

/**
 * Rename .js files to remove extension and make them executable
 * @param {Array} entryPoints - Array of entry point objects with 'out' property
 * @param {string} outDir - Output directory path
 */
function makeFilesExecutable(entryPoints, outDir) {
  entryPoints.forEach(ep => {
    const jsPath = path.join(outDir, `${ep.out}.js`);
    const finalPath = path.join(outDir, ep.out);

    try {
      // Rename from .js to no extension
      fs.renameSync(jsPath, finalPath);

      // Set permissions to 0o755 (rwxr-xr-x)
      // Owner: read, write, execute
      // Group: read, execute
      // Others: read, execute
      fs.chmodSync(finalPath, 0o755);

      console.log(`  ✓ Made executable: ${ep.out}`);
    } catch (error) {
      console.error(`  ✗ Failed to make executable: ${ep.out}`);
      console.error(`    Error: ${error.message}`);
    }
  });
}

// Run the build
async function build() {
  console.log('Building example executables...');
  console.log(`Output directory: ${outDir}`);
  console.log(`Entry points: ${entryPoints.length} files`);
  console.log('');

  try {
    const result = await esbuild.build(buildConfig);

    console.log('✓ Build completed successfully!');
    console.log('');

    console.log('Setting executable permissions...');
    makeFilesExecutable(entryPoints, outDir);
    console.log('');

    console.log('Built files:');
    entryPoints.forEach(ep => {
      console.log(`  - examples/dist/${ep.out}`);
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
