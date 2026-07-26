import { isValidEmail } from "@researchmind/utils";

export function validateLogin(email: string, password: string) {
  const errors: Record<string, string> = {};
  if (!isValidEmail(email)) errors.email = "Enter a valid email";
  if (!password || password.length < 6) errors.password = "Password must be at least 6 characters";
  return errors;
}

export function validateRegister(name: string, email: string, password: string) {
  const errors = validateLogin(email, password);
  if (!name.trim()) errors.name = "Name is required";
  return errors;
}
