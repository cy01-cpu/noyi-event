"use client"

import { useState } from "react"
import { format } from "date-fns"
import type { CheckIn, Registration } from "@prisma/client"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { TogglePaidButton } from "./toggle-paid-button"
import { ToggleRefundedButton } from "./toggle-refunded-button"
import { CancelRegistrationButton } from "./cancel-registration-button"
import { UndoCheckInButton } from "./undo-checkin-button"

const registrationStatusLabel: Record<string, string> = {
  PENDING: "待處理",
  CONFIRMED: "已確認",
  CANCELLED: "已取消",
  WAITLISTED: "候補中",
}

// 實心淺底 pill：文字皆為 *-800 深色，對 *-100 淺底 ≥6:1（WCAG AA ✓）
const registrationStatusBadgeClass: Record<string, string> = {
  PENDING: "bg-muted text-muted-foreground",
  CONFIRMED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
  WAITLISTED: "bg-amber-100 text-amber-800",
}

type RegistrationWithCheckIn = Registration & { checkIn: CheckIn | null }

type FormFieldSummary = {
  id: string
  label: string
  type: "TEXT" | "SELECT" | "CHECKBOX"
}

export function AttendeesList({
  registrations,
  formFields,
  requirePayment,
  amountLabel,
}: {
  registrations: RegistrationWithCheckIn[]
  formFields: FormFieldSummary[]
  requirePayment: boolean
  amountLabel: string | null
}) {
  const [query, setQuery] = useState("")

  // 純前端過濾：單場報名數目前規模（十幾到兩百人）一次載入、瀏覽器端
  // 篩選即可，不需要伺服器往返，也不需要另外做分頁（見審查討論）。
  const trimmedQuery = query.trim().toLowerCase()
  const filtered = trimmedQuery
    ? registrations.filter((r) => r.name.toLowerCase().includes(trimmedQuery))
    : registrations

  return (
    <div className="space-y-4">
      {registrations.length > 0 && (
        <Input
          placeholder="搜尋姓名"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-base text-muted-foreground">
            {registrations.length === 0
              ? "目前還沒有人報名"
              : "找不到符合的報名"}
          </CardContent>
        </Card>
      ) : (
        /* 卡片式布局（原為表格，欄位多、字級放大後需橫向捲動）。
           名單是逐筆核對用，固定單欄直列，由上往下掃視不易看錯行。 */
        filtered.map((r) => (
          <Card key={r.id}>
            <CardContent className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 break-words text-lg font-semibold">
                  {r.name}
                </p>
                {/* 已取消＋已繳費的報名依退費進度顯示不同狀態：
                    待退費用橘色與一般「已取消」（紅）區分，避免變成
                    沒人記得處理的糊塗帳；已退費則附上日期與經手人 */}
                {r.status === "CANCELLED" && r.isPaid ? (
                  r.refunded ? (
                    <Badge className="bg-red-100 text-red-800">
                      已取消（已退費
                      {r.refundedAt ? ` ${format(r.refundedAt, "MM/dd")}` : ""}
                      {r.refundedBy ? `・${r.refundedBy}` : ""}）
                    </Badge>
                  ) : (
                    <Badge className="border border-orange-400 bg-orange-100 text-orange-800">
                      已取消（待退費{amountLabel ? ` ${amountLabel}` : ""}）
                    </Badge>
                  )
                ) : (
                  <Badge className={registrationStatusBadgeClass[r.status]}>
                    {registrationStatusLabel[r.status]}
                  </Badge>
                )}
              </div>

              <p className="break-all text-base text-muted-foreground">
                {r.email}
              </p>

              {/* 所屬分行/單位：選填欄位，沒填就不顯示這行
                  （與下方自訂欄位答案同一套「未填不顯示」處理方式） */}
              {r.branch && (
                <p className="text-base">
                  <span className="text-muted-foreground">
                    所屬分行/單位：
                  </span>
                  {r.branch}
                </p>
              )}

              {/* 自訂報名欄位答案：選填欄位沒填就整行不顯示，避免
                  每張卡片都印一堆「未填」造成雜訊（見 event-form-field.ts） */}
              {formFields.length > 0 && (
                <div className="space-y-0.5">
                  {formFields.map((f) => {
                    const answers = (r.customFields ?? {}) as Record<
                      string,
                      string | boolean
                    >
                    const value = answers[f.id]
                    if (value === undefined) return null
                    const display =
                      f.type === "CHECKBOX" ? (value ? "是" : "否") : value
                    return (
                      <p key={f.id} className="text-base">
                        <span className="text-muted-foreground">
                          {f.label}：
                        </span>
                        {display}
                      </p>
                    )
                  })}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {r.checkIn ? (
                  <>
                    <Badge className="bg-green-100 text-green-800">
                      已報到
                    </Badge>
                    <span className="text-base text-muted-foreground">
                      {format(r.checkIn.checkedAt, "yyyy/MM/dd HH:mm")}
                      {r.checkIn.gate ? `・${r.checkIn.gate}` : ""}
                    </span>
                    <UndoCheckInButton registrationId={r.id} name={r.name} />
                  </>
                ) : (
                  <Badge className="bg-muted text-muted-foreground">
                    尚未報到
                  </Badge>
                )}
              </div>

              {/* C1 取消報名：已取消不重複顯示；已報到者人已到場不可取消
                  （後端 action 另有相同的硬性檢查，這裡是介面引導）。
                  取消 CONFIRMED 釋出的名額會在同一交易內自動遞補候補。 */}
              {r.status !== "CANCELLED" && !r.checkIn && (
                <div className="border-t pt-2.5">
                  <CancelRegistrationButton
                    registrationId={r.id}
                    name={r.name}
                    paidAmountLabel={r.isPaid ? amountLabel : null}
                  />
                </div>
              )}

              {requirePayment && (
                <div className="flex flex-wrap items-center gap-2 border-t pt-2.5">
                  <Badge
                    className={
                      r.isPaid
                        ? "bg-green-100 text-green-800"
                        : "bg-amber-100 text-amber-800"
                    }
                  >
                    {r.isPaid
                      ? `已繳費${
                          r.paidAt
                            ? `（${format(r.paidAt, "MM/dd")}${r.paidBy ? `・${r.paidBy}` : ""}）`
                            : ""
                        }`
                      : "未繳費"}
                  </Badge>
                  {/* 已取消的報名不再提供繳費標記（取消已繳費標記會
                      連帶抹掉「待退費」追蹤），改依繳費狀態提供
                      退費標記操作 */}
                  {r.status === "CANCELLED" ? (
                    r.isPaid && (
                      <ToggleRefundedButton
                        registrationId={r.id}
                        refunded={r.refunded}
                      />
                    )
                  ) : (
                    <TogglePaidButton registrationId={r.id} isPaid={r.isPaid} />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
