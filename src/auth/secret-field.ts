import type { BoxTextFieldElement } from "@unofficialbox/box-open-elements/components/forms/text-field";

/** Mask a box-text-field as a password input (BOE does not expose type=password). */
export function maskSecretField(field: BoxTextFieldElement): void {
  const apply = (): void => {
    const input = field.shadowRoot?.querySelector("input");
    if (!input) {
      return;
    }
    if (input.type !== "password") {
      input.type = "password";
    }
    input.autocomplete = "off";
    input.spellcheck = false;
  };

  apply();
  queueMicrotask(apply);

  if (field.shadowRoot) {
    const observer = new MutationObserver(apply);
    observer.observe(field.shadowRoot, { childList: true, subtree: true });
  }
}
