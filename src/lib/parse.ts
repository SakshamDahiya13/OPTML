import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { ParseResult } from "./db";

/**
 * Send a sentence to the parse-meal edge function.
 *
 * The function returns useful, specific error messages (a missing API key, a
 * model name the account can't use), but supabase-js hides the response body
 * behind a generic "non-2xx status code" error. Unwrapping it here is the
 * difference between a usable message and a dead end.
 */
export async function parseMeal(text: string): Promise<ParseResult> {
  const { data, error } = await supabase.functions.invoke("parse-meal", {
    body: { text },
  });

  if (error) {
    let message = error.message;
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null);
      if (body?.error) message = String(body.error);
    }
    throw new Error(message);
  }

  if (!data || !Array.isArray(data.items)) {
    throw new Error("The parser returned an unexpected response.");
  }

  return data as ParseResult;
}
