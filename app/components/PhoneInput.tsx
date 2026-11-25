'use client';

import type { ComponentProps } from 'react';

export function PhoneInput({ onChange, ...props }: Omit<ComponentProps<'input'>, 'type' | 'inputMode' | 'pattern'>) {
  return <input autoComplete="tel" {...props} type="tel" inputMode="numeric" pattern="[0-9]*"
    onChange={event => {
      const input = event.currentTarget;
      const digits = input.value.replace(/[^0-9]/g, '');
      if (input.value !== digits) {
        const caret = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/[^0-9]/g, '').length;
        input.value = digits;
        input.setSelectionRange(caret, caret);
      }
      onChange?.(event);
    }} />;
}
