import * as React from 'react';
import { Label } from './label';
import { cn } from '../lib/utils';

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
}

/**
 * Label + control + error message, wired together with the ARIA
 * attributes screen readers need (aria-invalid, aria-describedby) — per
 * SRS §13's accessibility requirement, not just a visual grouping.
 */
const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  ({ label, htmlFor, error, required, className, children, ...props }, ref) => {
    const errorId = `${htmlFor}-error`;
    return (
      <div ref={ref} className={cn('space-y-2', className)} {...props}>
        <Label htmlFor={htmlFor}>
          {label}
          {required && <span className="text-destructive"> *</span>}
        </Label>
        {React.isValidElement(children)
          ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
              id: htmlFor,
              'aria-invalid': !!error,
              'aria-describedby': error ? errorId : undefined,
            })
          : children}
        {error && (
          <p id={errorId} className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  },
);
FormField.displayName = 'FormField';

export { FormField };
