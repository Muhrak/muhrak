import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "@/lib/api";

/**
 * Show an API error on the form: field errors go under their field, anything
 * else becomes the form-level message (`errors.root.server`).
 */
export function applyApiError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fieldNames: readonly Path<T>[],
): void {
  if (error instanceof ApiError) {
    let placedOnField = false;
    for (const fieldError of error.fieldErrors) {
      const name = fieldNames.find((field) => field === fieldError.path);
      if (name) {
        setError(name, { type: "server", message: fieldError.message });
        placedOnField = true;
      }
    }
    if (!placedOnField) {
      setError("root.server", { type: "server", message: error.message });
    }
    return;
  }
  setError("root.server", { type: "server", message: "Something went wrong. Please try again." });
}
