/**
 * Wizard Pattern for MCP Flow
 * Multi-step guided flows with sequential prompts
 */

import { ToolExecutionContext } from '../server/interactive-server';
import { InteractionPrompt, PromptType } from '../protocol/types';

export interface WizardStep {
  id: string;
  prompt: InteractionPrompt;
  validate?: (value: unknown, context: WizardContext) => boolean | string;
  transform?: (value: unknown) => unknown;
  condition?: (context: WizardContext) => boolean;
}

export interface WizardContext {
  [key: string]: unknown;
}

export interface WizardConfig {
  steps: WizardStep[];
  onComplete?: (context: WizardContext) => unknown;
}

/**
 * Wizard pattern implementation
 */
export class Wizard {
  private steps: WizardStep[];
  private onComplete?: (context: WizardContext) => unknown;

  constructor(config: WizardConfig) {
    this.steps = config.steps;
    this.onComplete = config.onComplete;
  }

  /**
   * Executes the wizard flow
   */
  async execute(executionContext: ToolExecutionContext): Promise<unknown> {
    const wizardContext: WizardContext = {};
    let currentStep = 0;

    while (currentStep < this.steps.length) {
      const step = this.steps[currentStep];

      // Check if step should be executed
      if (step.condition && !step.condition(wizardContext)) {
        currentStep++;
        continue;
      }

      // Prompt user
      const response = await executionContext.prompt(step.prompt);
      let value = response.value;

      // Custom validation
      if (step.validate) {
        const validationResult = step.validate(value, wizardContext);
        if (validationResult !== true) {
          // Re-prompt with error
          const errorPrompt: InteractionPrompt = {
            ...step.prompt,
            message: `${step.prompt.message}\n\nError: ${
              typeof validationResult === 'string' ? validationResult : 'Invalid input'
            }`,
          };
          executionContext.prompt(errorPrompt);
          continue;
        }
      }

      // Transform value if needed
      if (step.transform) {
        value = step.transform(value);
      }

      // Store in context
      wizardContext[step.id] = value;
      executionContext.setData(step.id, value);

      // Update progress
      executionContext.updateProgress(currentStep + 1, this.steps.length);

      currentStep++;
    }

    // Complete wizard
    const result = this.onComplete ? this.onComplete(wizardContext) : wizardContext;
    return result;
  }
}

/**
 * Builder for creating wizard flows
 */
export class WizardBuilder {
  private steps: WizardStep[] = [];
  private completionHandler?: (context: WizardContext) => unknown;

  /**
   * Adds a text input step
   */
  addText(
    id: string,
    message: string,
    options?: {
      placeholder?: string;
      defaultValue?: string;
      required?: boolean;
      pattern?: string;
      validate?: (value: unknown, context: WizardContext) => boolean | string;
    }
  ): this {
    this.steps.push({
      id,
      prompt: {
        type: PromptType.TEXT,
        message,
        placeholder: options?.placeholder,
        defaultValue: options?.defaultValue,
        validation: {
          required: options?.required,
          pattern: options?.pattern,
        },
      },
      validate: options?.validate,
    });
    return this;
  }

  /**
   * Adds a number input step
   */
  addNumber(
    id: string,
    message: string,
    options?: {
      defaultValue?: number;
      min?: number;
      max?: number;
      required?: boolean;
      validate?: (value: unknown, context: WizardContext) => boolean | string;
    }
  ): this {
    this.steps.push({
      id,
      prompt: {
        type: PromptType.NUMBER,
        message,
        defaultValue: options?.defaultValue,
        validation: {
          required: options?.required,
          min: options?.min,
          max: options?.max,
        },
      },
      validate: options?.validate,
    });
    return this;
  }

  /**
   * Adds a choice step
   */
  addChoice(
    id: string,
    message: string,
    choices: Array<{ value: string; label: string }>,
    options?: {
      required?: boolean;
      validate?: (value: unknown, context: WizardContext) => boolean | string;
    }
  ): this {
    this.steps.push({
      id,
      prompt: {
        type: PromptType.CHOICE,
        message,
        choices,
        validation: {
          required: options?.required,
        },
      },
      validate: options?.validate,
    });
    return this;
  }

  /**
   * Adds a confirmation step
   */
  addConfirm(
    id: string,
    message: string,
    options?: {
      defaultValue?: boolean;
    }
  ): this {
    this.steps.push({
      id,
      prompt: {
        type: PromptType.CONFIRM,
        message,
        defaultValue: options?.defaultValue,
      },
    });
    return this;
  }

  /**
   * Adds a conditional step
   */
  addConditional(
    step: WizardStep,
    condition: (context: WizardContext) => boolean
  ): this {
    this.steps.push({
      ...step,
      condition,
    });
    return this;
  }

  /**
   * Sets completion handler
   */
  onComplete(handler: (context: WizardContext) => unknown): this {
    this.completionHandler = handler;
    return this;
  }

  /**
   * Builds the wizard
   */
  build(): Wizard {
    return new Wizard({
      steps: this.steps,
      onComplete: this.completionHandler,
    });
  }
}
