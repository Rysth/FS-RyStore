import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import type { UseFormRegisterReturn } from "react-hook-form";

interface PasswordInputProps {
  register?: UseFormRegisterReturn;
  placeholder?: string;
  name?: string;
  autoComplete?: string;
}

export default function PasswordInput({
  register,
  placeholder = "********",
  name = "password",
  autoComplete = "current-password",
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <InputGroup>
      <InputGroupAddon>
        <Lock className="w-4 h-4 opacity-50" />
      </InputGroupAddon>
      <InputGroupInput
        type={showPassword ? "text" : "password"}
        name={name}
        placeholder={placeholder}
        autoComplete={autoComplete}
        {...register}
      />
      <InputGroupAddon align="inline-end">
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="p-1 transition-opacity opacity-50 hover:opacity-100"
          aria-label={
            showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
          }
        >
          {showPassword ? (
            <EyeOff className="w-4 h-4" />
          ) : (
            <Eye className="w-4 h-4" />
          )}
        </button>
      </InputGroupAddon>
    </InputGroup>
  );
}
