"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export function DatePicker({
  selected,
  onSelect,
  locale,
  placeholderText = "Sélectionner une date",
  ...props
}: {
  selected?: Date | null;
  onSelect?: (date: Date | null) => void;
  locale?: any;
  placeholderText?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal",
            !selected && "text-muted-foreground"
          )}
          {...props}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selected ? format(selected, "PPP", { locale }) : <span>{placeholderText}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected || undefined}
          onSelect={(date) => {
            if (onSelect && (date === null || date instanceof Date)) {
              onSelect(date);
            }
          }}
          locale={locale}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
