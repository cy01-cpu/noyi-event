"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DateTimePickerProps {
  value?: Date
  onChange: (date: Date | undefined) => void
  placeholder?: string
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "選擇日期",
}: DateTimePickerProps) {
  function handleDateSelect(date: Date | undefined) {
    if (!date) {
      onChange(undefined)
      return
    }
    const next = new Date(date)
    if (value) {
      next.setHours(value.getHours(), value.getMinutes(), 0, 0)
    } else {
      next.setHours(9, 0, 0, 0)
    }
    onChange(next)
  }

  function handleTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const [hours, minutes] = e.target.value.split(":").map(Number)
    const base = value ?? new Date()
    const next = new Date(base)
    next.setHours(hours, minutes, 0, 0)
    onChange(next)
  }

  return (
    <div className="flex gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "flex-1 justify-start text-left font-normal",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon />
            {value ? format(value, "yyyy/MM/dd") : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={value}
            onSelect={handleDateSelect}
          />
        </PopoverContent>
      </Popover>
      <Input
        type="time"
        className="w-28"
        value={value ? format(value, "HH:mm") : ""}
        onChange={handleTimeChange}
      />
    </div>
  )
}
