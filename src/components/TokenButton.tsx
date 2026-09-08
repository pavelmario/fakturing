import type { RefObject } from "react";
import { insertToken } from "../lib/insertToken";

type TokenButtonProps = {
  token: string;
  field: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
};

/**
 * One token of a template, inserted where the caret is.
 *
 * `onMouseDown` is cancelled so pressing the button never takes the focus off
 * the field: a button that steals it first leaves the field with no selection
 * to insert into, which is how these used to append to the end no matter
 * where you were typing.
 */
export function TokenButton({ token, field, value, onChange }: TokenButtonProps) {
  return (
    <button
      type="button"
      className="token"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => insertToken(field.current, value, token, onChange)}
    >
      {token}
    </button>
  );
}
