/**
 * Example: File Finder
 * Demonstrates the Clarification pattern for ambiguity resolution
 */

import { InteractiveTool, ToolExecutionContext } from '../../../src/server/interactive-server';
import { Clarification, Disambiguate } from '../../../src/patterns/clarification';
import { PromptType } from '../../../src/protocol/types';

interface FileMatch {
  id: string;
  title: string;
  description: string;
  path: string;
  size: number;
  modified: Date;
}

/**
 * File finder with disambiguation
 */
export const fileFinderTool: InteractiveTool = {
  name: 'find_file',
  description: 'Find files with interactive disambiguation',

  async execute(context: ToolExecutionContext): Promise<unknown> {
    // Get search query
    const searchResponse = await context.prompt({
      type: PromptType.TEXT,
      message: 'What file are you looking for?',
      placeholder: 'Enter filename or pattern',
      validation: { required: true },
    });

    const searchQuery = String(searchResponse.value);

    // Simulate file search
    const results = await simulateFileSearch(searchQuery);

    if (results.length === 0) {
      return {
        success: false,
        message: 'No files found matching your query',
      };
    }

    if (results.length === 1) {
      // Single match - no disambiguation needed
      return {
        success: true,
        file: results[0],
        message: 'File found',
      };
    }

    // Multiple matches - disambiguate
    const clarification = new Clarification(
      Disambiguate.fromSearchResults(
        results,
        `Found ${results.length} files matching "${searchQuery}". Please select one:`
      )
    );

    const selectedFile = await clarification.execute(context);

    return {
      success: true,
      file: selectedFile,
      message: 'File selected',
    };
  },
};

/**
 * Multi-level file browser
 */
export const fileBrowserTool: InteractiveTool = {
  name: 'browse_files',
  description: 'Browse files with hierarchical navigation',

  async execute(context: ToolExecutionContext): Promise<unknown> {
    let currentPath = '/';
    let selectedFile: FileMatch | null = null;

    while (!selectedFile) {
      // Get items in current directory
      const items = await simulateDirectoryListing(currentPath);

      const clarification = new Clarification({
        message: `Contents of ${currentPath}:`,
        context: 'Select a file or directory to navigate',
        options: [
          ...(currentPath !== '/'
            ? [{ value: '..', label: '.. (Parent directory)', data: null }]
            : []),
          ...items.map((item) => ({
            value: item.id,
            label: item.title,
            description: item.description,
            data: item,
          })),
        ],
        allowCustom: false,
      });

      const selection = await clarification.execute(context);

      if (selection === null) {
        // Go to parent directory
        currentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
        continue;
      }

      const item = selection as FileMatch;

      if (item.description.includes('directory')) {
        // Navigate into directory
        currentPath = item.path;
      } else {
        // File selected
        selectedFile = item;
      }
    }

    return {
      success: true,
      file: selectedFile,
      message: 'File selected',
    };
  },
};

/**
 * Smart file actions
 */
export const fileActionsTool: InteractiveTool = {
  name: 'file_actions',
  description: 'Perform actions on files with smart suggestions',

  async execute(context: ToolExecutionContext): Promise<unknown> {
    const { initialParams } = context;
    const filePath = initialParams?.filePath as string;

    if (!filePath) {
      return { success: false, error: 'No file specified' };
    }

    // Simulate file info
    const fileInfo = await getFileInfo(filePath);

    // Smart action suggestions based on file type
    const actions = getSmartActions(fileInfo);

    const actionClarification = new Clarification({
      message: `What would you like to do with ${fileInfo.title}?`,
      context: `File: ${filePath}\nSize: ${formatBytes(fileInfo.size)}\nModified: ${fileInfo.modified.toLocaleString()}`,
      options: actions,
    });

    const selectedAction = await actionClarification.execute(context);

    // Confirm destructive actions
    if (
      typeof selectedAction === 'string' &&
      ['delete', 'move', 'rename'].includes(selectedAction)
    ) {
      const confirmResponse = await context.prompt({
        type: PromptType.CONFIRM,
        message: `Are you sure you want to ${selectedAction} this file?`,
        defaultValue: false,
      });

      if (!confirmResponse.value) {
        return {
          success: false,
          message: 'Action cancelled',
        };
      }
    }

    return {
      success: true,
      action: selectedAction,
      file: fileInfo,
      message: `Action "${selectedAction}" will be performed`,
    };
  },
};

// Helper functions

function simulateFileSearch(query: string): Promise<FileMatch[]> {
  const mockFiles: FileMatch[] = [
    {
      id: '1',
      title: 'config.json',
      description: 'Configuration file (1.2 KB)',
      path: '/app/config.json',
      size: 1200,
      modified: new Date('2024-01-15'),
    },
    {
      id: '2',
      title: 'config.dev.json',
      description: 'Development configuration (800 B)',
      path: '/app/config.dev.json',
      size: 800,
      modified: new Date('2024-01-10'),
    },
    {
      id: '3',
      title: 'config.prod.json',
      description: 'Production configuration (950 B)',
      path: '/app/config.prod.json',
      size: 950,
      modified: new Date('2024-01-12'),
    },
  ];

  return Promise.resolve(
    mockFiles.filter((f) => f.title.toLowerCase().includes(query.toLowerCase()))
  );
}

function simulateDirectoryListing(path: string): Promise<FileMatch[]> {
  const mockItems: Record<string, FileMatch[]> = {
    '/': [
      {
        id: 'd1',
        title: 'app',
        description: 'directory',
        path: '/app',
        size: 0,
        modified: new Date(),
      },
      {
        id: 'd2',
        title: 'docs',
        description: 'directory',
        path: '/docs',
        size: 0,
        modified: new Date(),
      },
    ],
    '/app': [
      {
        id: 'f1',
        title: 'index.ts',
        description: 'TypeScript file (5.2 KB)',
        path: '/app/index.ts',
        size: 5200,
        modified: new Date(),
      },
    ],
  };

  return Promise.resolve(mockItems[path] || []);
}

function getFileInfo(path: string): Promise<FileMatch> {
  return Promise.resolve({
    id: '1',
    title: path.split('/').pop() || 'unknown',
    description: 'File',
    path,
    size: 1000,
    modified: new Date(),
  });
}

function getSmartActions(fileInfo: FileMatch) {
  const extension = fileInfo.title.split('.').pop();
  const baseActions = [
    { value: 'view', label: 'View', description: 'Open file for viewing' },
    { value: 'edit', label: 'Edit', description: 'Open in editor' },
    { value: 'copy', label: 'Copy', description: 'Copy to clipboard' },
    { value: 'move', label: 'Move', description: 'Move to another location' },
    { value: 'rename', label: 'Rename', description: 'Rename file' },
    { value: 'delete', label: 'Delete', description: 'Delete file' },
  ];

  // Add smart actions based on file type
  if (extension === 'ts' || extension === 'js') {
    baseActions.unshift({
      value: 'run',
      label: 'Run',
      description: 'Execute this script',
    });
  }

  if (extension === 'json') {
    baseActions.unshift({
      value: 'validate',
      label: 'Validate',
      description: 'Validate JSON syntax',
    });
  }

  return baseActions;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
