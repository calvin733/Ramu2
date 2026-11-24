"use client";

import { ArrowUp, LoaderCircle } from "lucide-react";
import { useActionState, useState } from "react";

export function AssistantComposer({
  ask,
}: {
  ask: (
    previous: { error: string },
    form: FormData,
  ) => Promise<{ error: string }>;
}) {
  const [value, setValue] = useState("");
  const [state, action, pending] = useActionState(ask, { error: "" });
  return (
    <form action={action} aria-busy={pending}>
      <label className="sr-only" htmlFor="assistant-question">
        Pertanyaan untuk Asisten
      </label>
      <div className="assistant-composer">
        <input
          id="assistant-question"
          name="pertanyaan"
          placeholder="Tulis pertanyaan"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          required
          maxLength={250}
          aria-describedby={state.error ? "assistant-input-error" : undefined}
          aria-invalid={!!state.error}
        />
        <button
          type="submit"
          disabled={pending || !value.trim()}
          aria-label="Kirim pertanyaan"
        >
          {pending ? (
            <LoaderCircle aria-hidden="true" size={20} />
          ) : (
            <ArrowUp aria-hidden="true" size={20} />
          )}
        </button>
      </div>
      {state.error && (
        <p className="form-message" id="assistant-input-error" role="alert">
          {state.error}
        </p>
      )}
      <span className="sr-only" role="status">
        {pending ? "Memeriksa pertanyaan." : ""}
      </span>
    </form>
  );
}
