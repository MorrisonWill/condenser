import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface FileInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
    value?: string
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void
}

const FileInput = React.forwardRef<HTMLInputElement, FileInputProps>(
    ({ className, value, onChange, ...props }) => {
        const inputRef = React.useRef<HTMLInputElement>(null)

        const handleClick = () => {
            inputRef.current?.click()
        }

        return (
            <div className={cn("flex items-center gap-2", className)}>
                <Button type="button" variant="outline" onClick={handleClick}>
                    Choose File
                </Button>
                <Input
                    readOnly
                    value={value || "No file chosen"}
                    className="flex-grow"
                />
                <input
                    type="file"
                    ref={inputRef}
                    className="hidden"
                    onChange={onChange}
                    {...props}
                />
            </div>
        )
    }
)
FileInput.displayName = "FileInput"

export { FileInput }
