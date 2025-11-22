/**
 * Example: Email Validator
 * Demonstrates the Validation pattern with retry logic
 */

import { InteractiveTool, ToolExecutionContext } from '../server/interactive-server';
import { ValidatedInput, Validators } from '../patterns/validation';
import { PromptType } from '../protocol/types';

/**
 * Email validation tool with domain verification
 */
export const emailValidatorTool: InteractiveTool = {
  name: 'validate_email',
  description: 'Validates and verifies email addresses',

  async execute(context: ToolExecutionContext): Promise<unknown> {
    // Simple email validation
    const basicEmailValidator = new ValidatedInput({
      maxAttempts: 3,
      prompt: {
        type: PromptType.TEXT,
        message: 'Please enter your email address:',
        placeholder: 'user@example.com',
        validation: {
          required: true,
        },
      },
      validate: Validators.combine(
        Validators.email(),
        Validators.custom(async (value) => {
          // Simulate async validation (e.g., check if email exists)
          const email = String(value);
          const domain = email.split('@')[1];

          // Block certain domains
          const blockedDomains = ['tempmail.com', 'throwaway.email'];
          if (blockedDomains.includes(domain)) {
            return false;
          }

          return true;
        }, 'This email domain is not allowed')
      ),
      onSuccess: (value) => {
        context.setData('email', value);
        return value;
      },
      onFailure: (errors) => {
        context.setData('validationErrors', errors);
      },
    });

    const email = await basicEmailValidator.execute(context);

    // Confirmation validation
    const confirmValidator = new ValidatedInput({
      maxAttempts: 3,
      prompt: {
        type: PromptType.TEXT,
        message: 'Please confirm your email address:',
        placeholder: 'user@example.com',
        validation: {
          required: true,
        },
      },
      validate: (value) => {
        if (String(value) !== String(email)) {
          return {
            valid: false,
            error: 'Email addresses do not match',
            suggestion: `Expected: ${email}`,
          };
        }
        return { valid: true };
      },
    });

    await confirmValidator.execute(context);

    return {
      success: true,
      email,
      message: 'Email validated successfully',
      timestamp: new Date().toISOString(),
    };
  },
};

/**
 * Advanced form validation with multiple fields
 */
export const formValidatorTool: InteractiveTool = {
  name: 'validate_form',
  description: 'Validates complex forms with multiple fields',

  async execute(context: ToolExecutionContext): Promise<unknown> {
    // Name validation
    const nameValidator = new ValidatedInput({
      prompt: {
        type: PromptType.TEXT,
        message: 'Enter your full name:',
        validation: { required: true },
      },
      validate: Validators.combine(
        Validators.length(2, 100),
        Validators.pattern(/^[a-zA-Z\s]+$/, 'Name should only contain letters and spaces')
      ),
    });

    const name = await nameValidator.execute(context);

    // Age validation
    const ageValidator = new ValidatedInput({
      prompt: {
        type: PromptType.NUMBER,
        message: 'Enter your age:',
        validation: { required: true },
      },
      validate: Validators.range(18, 120),
    });

    const age = await ageValidator.execute(context);

    // Website validation (optional)
    const websiteValidator = new ValidatedInput({
      prompt: {
        type: PromptType.TEXT,
        message: 'Enter your website (optional):',
        validation: { required: false },
      },
      validate: (value) => {
        if (!value || String(value).trim() === '') {
          return { valid: true };
        }
        return Validators.url()(value);
      },
    });

    const website = await websiteValidator.execute(context);

    return {
      success: true,
      data: {
        name,
        age,
        website: website || null,
      },
      message: 'Form validated successfully',
    };
  },
};
