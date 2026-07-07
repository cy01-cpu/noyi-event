"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// 繳費經手人欄位仿報到掃碼的 gate 模式：頁面頂端填一次，之後每筆
// 「標記已繳費」都自動帶上，不用逐筆重打。用 Context 讓 server component
// 渲染的名單卡片（作為 children 傳入）裡的 TogglePaidButton 讀得到目前值。
const PaidOperatorContext = createContext("")

export function usePaidOperator(): string {
  return useContext(PaidOperatorContext)
}

export function PaidOperatorProvider({ children }: { children: ReactNode }) {
  const [operator, setOperator] = useState("")

  return (
    <PaidOperatorContext.Provider value={operator}>
      <div className="mb-6 space-y-1.5">
        <Label htmlFor="paid-operator">收費經手人／站別（選填）</Label>
        <Input
          id="paid-operator"
          placeholder="例如：王小明 或 收費台A"
          maxLength={50}
          value={operator}
          onChange={(e) => setOperator(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          填寫後，之後每筆「標記已繳費」會自動記下這個名字，方便日後對帳追查。
        </p>
      </div>
      {children}
    </PaidOperatorContext.Provider>
  )
}
