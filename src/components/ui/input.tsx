import { InputHTMLAttributes, forwardRef } from 'react'
import { cn } from './button'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> { }

const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ className, ...props }, ref) => {
        return (
            <input
                ref={ref}
                className={cn(
                    'flex h-11 w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50',
                    className
                )}
                {...props}
            />
        )
    }
)
Input.displayName = 'Input'

export { Input }
