/**
 * Example: Booking Wizard
 * Demonstrates the Wizard pattern for a travel booking flow
 */

import { InteractiveTool, ToolExecutionContext } from '../server/interactive-server';
import { WizardBuilder } from '../patterns/wizard';
import { PromptType } from '../protocol/types';

/**
 * Travel booking wizard tool
 */
export const bookingWizardTool: InteractiveTool = {
  name: 'travel_booking',
  description: 'Interactive travel booking wizard',

  async execute(context: ToolExecutionContext): Promise<unknown> {
    const wizard = new WizardBuilder()
      .addText('destination', 'Where would you like to go?', {
        placeholder: 'e.g., Paris, Tokyo, New York',
        required: true,
        validate: (value) => {
          const dest = String(value).trim();
          if (dest.length < 2) {
            return 'Destination must be at least 2 characters';
          }
          return true;
        },
      })
      .addText('departureDate', 'When would you like to depart?', {
        placeholder: 'YYYY-MM-DD',
        required: true,
        validate: (value) => {
          const date = new Date(String(value));
          if (isNaN(date.getTime())) {
            return 'Invalid date format. Use YYYY-MM-DD';
          }
          if (date < new Date()) {
            return 'Departure date must be in the future';
          }
          return true;
        },
      })
      .addText('returnDate', 'When would you like to return?', {
        placeholder: 'YYYY-MM-DD',
        required: false,
        validate: (value, wizardContext) => {
          if (!value) return true; // Optional field

          const returnDate = new Date(String(value));
          const departureDate = new Date(String(wizardContext.departureDate));

          if (isNaN(returnDate.getTime())) {
            return 'Invalid date format. Use YYYY-MM-DD';
          }

          if (returnDate <= departureDate) {
            return 'Return date must be after departure date';
          }

          return true;
        },
      })
      .addNumber('travelers', 'How many travelers?', {
        min: 1,
        max: 10,
        defaultValue: 1,
        required: true,
      })
      .addChoice(
        'travelClass',
        'What class would you prefer?',
        [
          { value: 'economy', label: 'Economy' },
          { value: 'premium', label: 'Premium Economy' },
          { value: 'business', label: 'Business Class' },
          { value: 'first', label: 'First Class' },
        ],
        { required: true }
      )
      .addConditional(
        {
          id: 'mealPreference',
          prompt: {
            type: PromptType.CHOICE,
            message: 'Do you have any meal preferences?',
            choices: [
              { value: 'none', label: 'No preference' },
              { value: 'vegetarian', label: 'Vegetarian' },
              { value: 'vegan', label: 'Vegan' },
              { value: 'halal', label: 'Halal' },
              { value: 'kosher', label: 'Kosher' },
            ],
          },
        },
        (wizardContext) => {
          // Only ask for meal preference if business or first class
          const travelClass = wizardContext.travelClass as string;
          return travelClass === 'business' || travelClass === 'first';
        }
      )
      .addConfirm('newsletter', 'Would you like to receive travel deals and updates?', {
        defaultValue: false,
      })
      .onComplete((wizardContext) => {
        // Process booking
        const booking = {
          id: `booking_${Date.now()}`,
          ...wizardContext,
          status: 'pending',
          createdAt: new Date().toISOString(),
        };

        return {
          success: true,
          booking,
          message: `Booking created successfully! Booking ID: ${booking.id}`,
        };
      })
      .build();

    return wizard.execute(context);
  },
};
