export class ContactValidationError extends Error {
  constructor(message: string, field?: string);
  statusCode: number;
  field?: string;
}

export const CONTACT_BODY_MAX_BYTES: number;

export const CONTACT_FIELD_LIMITS: Readonly<{
  name: number;
  email: number;
  subject: number;
  message: number;
}>;

export function validateContactSubmission(input: unknown): {
  name: string;
  email: string;
  subject: string;
  message: string;
};
