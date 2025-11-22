/**
 * Clarification Pattern for MCP Flow
 * Ambiguity resolution through user selection
 */

import { ToolExecutionContext } from '../server/interactive-server';
import { InteractionPrompt, PromptType } from '../protocol/types';

export interface ClarificationOption<T = unknown> {
  value: string;
  label: string;
  description?: string;
  data?: T;
}

export interface ClarificationConfig<T = unknown> {
  message: string;
  options: ClarificationOption<T>[];
  context?: string;
  allowCustom?: boolean;
  customPrompt?: string;
}

/**
 * Clarification pattern for ambiguity resolution
 */
export class Clarification<T = unknown> {
  private config: ClarificationConfig<T>;

  constructor(config: ClarificationConfig<T>) {
    this.config = config;
  }

  /**
   * Executes clarification flow
   */
  async execute(executionContext: ToolExecutionContext): Promise<T | string> {
    const choices = this.config.options.map((opt) => ({
      value: opt.value,
      label: opt.description ? `${opt.label} - ${opt.description}` : opt.label,
    }));

    // Add custom option if allowed
    if (this.config.allowCustom) {
      choices.push({
        value: '__custom__',
        label: 'Other (specify)',
      });
    }

    const message = this.config.context
      ? `${this.config.context}\n\n${this.config.message}`
      : this.config.message;

    const prompt: InteractionPrompt = {
      type: PromptType.CHOICE,
      message,
      choices,
      validation: {
        required: true,
      },
    };

    const response = await executionContext.prompt(prompt);
    const selectedValue = String(response.value);

    // Handle custom input
    if (selectedValue === '__custom__' && this.config.allowCustom) {
      const customPrompt: InteractionPrompt = {
        type: PromptType.TEXT,
        message: this.config.customPrompt ?? 'Please specify:',
        validation: {
          required: true,
        },
      };

      const customResponse = await executionContext.prompt(customPrompt);
      return String(customResponse.value);
    }

    // Return selected option data
    const selectedOption = this.config.options.find(
      (opt) => opt.value === selectedValue
    );

    if (selectedOption?.data !== undefined) {
      return selectedOption.data;
    }

    return selectedValue;
  }
}

/**
 * Multi-level clarification for hierarchical choices
 */
export class HierarchicalClarification {
  private levels: ClarificationConfig[];

  constructor(levels: ClarificationConfig[]) {
    this.levels = levels;
  }

  /**
   * Executes hierarchical clarification
   */
  async execute(executionContext: ToolExecutionContext): Promise<unknown[]> {
    const selections: unknown[] = [];

    for (const level of this.levels) {
      const clarification = new Clarification(level);
      const selection = await clarification.execute(executionContext);
      selections.push(selection);

      // Store selection in context
      executionContext.setData(`level_${selections.length}`, selection);
    }

    return selections;
  }
}

/**
 * Smart clarification that learns from context
 */
export class SmartClarification<T = unknown> {
  private baseConfig: ClarificationConfig<T>;
  private contextAnalyzer?: (
    context: Record<string, unknown>
  ) => ClarificationOption<T>[];

  constructor(
    config: ClarificationConfig<T>,
    contextAnalyzer?: (
      context: Record<string, unknown>
    ) => ClarificationOption<T>[]
  ) {
    this.baseConfig = config;
    this.contextAnalyzer = contextAnalyzer;
  }

  /**
   * Executes smart clarification with context awareness
   */
  async execute(executionContext: ToolExecutionContext): Promise<T | string> {
    let options = this.baseConfig.options;

    // Enhance options based on context
    if (this.contextAnalyzer) {
      const context = executionContext.getData() as Record<string, unknown>;
      const contextOptions = this.contextAnalyzer(context);
      options = [...contextOptions, ...options];
    }

    const clarification = new Clarification({
      ...this.baseConfig,
      options,
    });

    return clarification.execute(executionContext);
  }
}

/**
 * Disambiguation helper for common scenarios
 */
export const Disambiguate = {
  /**
   * Disambiguate from search results
   */
  fromSearchResults: <T extends { id: string; title: string; description?: string }>(
    results: T[],
    message?: string
  ): ClarificationConfig<T> => {
    return {
      message: message ?? 'Multiple matches found. Please select one:',
      options: results.map((result) => ({
        value: result.id,
        label: result.title,
        description: result.description,
        data: result,
      })),
    };
  },

  /**
   * Disambiguate file paths
   */
  fromPaths: (paths: string[], message?: string): ClarificationConfig<string> => {
    return {
      message: message ?? 'Multiple files found. Please select one:',
      options: paths.map((path) => ({
        value: path,
        label: path,
        data: path,
      })),
    };
  },

  /**
   * Yes/No/Maybe choice
   */
  yesNoMaybe: (message: string): ClarificationConfig<boolean | null> => {
    return {
      message,
      options: [
        { value: 'yes', label: 'Yes', data: true },
        { value: 'no', label: 'No', data: false },
        { value: 'maybe', label: 'Not sure', data: null },
      ],
    };
  },

  /**
   * Severity/Priority selection
   */
  severity: (
    message: string
  ): ClarificationConfig<'low' | 'medium' | 'high' | 'critical'> => {
    return {
      message,
      options: [
        { value: 'low', label: 'Low', description: 'Minor issue' },
        { value: 'medium', label: 'Medium', description: 'Moderate impact' },
        { value: 'high', label: 'High', description: 'Significant impact' },
        {
          value: 'critical',
          label: 'Critical',
          description: 'Requires immediate attention',
        },
      ],
    };
  },
};
