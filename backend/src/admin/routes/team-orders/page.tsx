/**
 * The admin's list of team orders (menu entry "Team orders"): newest first, paged, filtered by
 * status. Each row opens the order's page (./[id]/page.tsx). All data comes from
 * GET /admin/team-orders; the words and colours are in ../../lib/team-orders.ts.
 */
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { UserGroup } from "@medusajs/icons"
import { Badge, Container, Heading, Select, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  daysLeftText,
  errorText,
  formatDay,
  formatTime,
  kindLabel,
  playersText,
  proofStatusColor,
  proofStatusLabel,
  rangeText,
  scheduleColor,
  scheduleLabel,
  statusColor,
  statusLabel,
  STATUSES,
  type ListAnswer,
} from "../../lib/team-orders"

const PAGE_SIZE = 20
const ALL = "all"

async function fetchList(status: string, page: number): Promise<ListAnswer> {
  const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) })
  if (status !== ALL) query.set("status", status)
  const response = await fetch(`/admin/team-orders?${query.toString()}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(errorText(body, response.status))
  return body as ListAnswer
}

const TeamOrdersPage = () => {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const status = params.get("status") ?? ALL
  const page = Math.max(0, Number.parseInt(params.get("page") ?? "0", 10) || 0)

  const { data, isLoading, error } = useQuery({
    queryKey: ["fitmyoutfit", "team-orders", status, page],
    queryFn: () => fetchList(status, page),
  })

  const setFilter = (value: string) => {
    const next = new URLSearchParams()
    if (value !== ALL) next.set("status", value)
    setParams(next)
  }
  const goTo = (target: number) => {
    const next = new URLSearchParams(params)
    next.set("page", String(target))
    setParams(next)
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h1">Team orders</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Orders from teams and clubs, newest first.
          </Text>
        </div>
        <div className="w-[200px]">
          <Select value={status} onValueChange={setFilter}>
            <Select.Trigger aria-label="Filter by status">
              <Select.Value placeholder="All statuses" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value={ALL}>All statuses</Select.Item>
              {STATUSES.map((s) => (
                <Select.Item key={s} value={s}>
                  {statusLabel(s)}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
      </div>

      {error ? (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-error">
            {(error as Error).message}
          </Text>
        </div>
      ) : isLoading || !data ? (
        <div className="px-6 py-4">
          <Text size="small">Loading...</Text>
        </div>
      ) : data.team_orders.length === 0 ? (
        <div className="px-6 py-8">
          <Text size="small" className="text-ui-fg-subtle">
            No team orders{status === ALL ? "" : ` with status "${statusLabel(status)}"`}.
          </Text>
        </div>
      ) : (
        <>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Team</Table.HeaderCell>
                <Table.HeaderCell>Organizer</Table.HeaderCell>
                <Table.HeaderCell>Region</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Players</Table.HeaderCell>
                <Table.HeaderCell>Need by</Table.HeaderCell>
                <Table.HeaderCell>Proof</Table.HeaderCell>
                <Table.HeaderCell>Created</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.team_orders.map((order) => {
                const open = order.status === "draft" || order.status === "proof_sent"
                const left = open ? daysLeftText(order.schedule.days_left_standard) : null
                return (
                  <Table.Row
                    key={order.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/team-orders/${order.id}`)}
                  >
                    <Table.Cell>
                      <div className="flex flex-col items-start gap-y-1">
                        <span>{order.team_name}</span>
                        {order.kind !== "order" && (
                          <Badge size="2xsmall" color="blue" className="whitespace-nowrap">
                            {kindLabel(order.kind)}
                          </Badge>
                        )}
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <div>{order.organizer.name || "-"}</div>
                      <Text size="xsmall" className="break-all text-ui-fg-subtle">
                        {order.organizer.email ?? ""}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>{order.region.name}</Table.Cell>
                    <Table.Cell>
                      <Badge size="2xsmall" color={statusColor(order.status)} className="whitespace-nowrap">
                        {statusLabel(order.status)}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>{playersText(order.players, order.pieces)}</Table.Cell>
                    <Table.Cell>
                      {order.need_by_date ? (
                        <div className="flex flex-col gap-y-1">
                          <span>{formatDay(order.need_by_date)}</span>
                          <div className="flex items-center gap-x-2">
                            <Badge size="2xsmall" color={scheduleColor(order.schedule.state)} className="whitespace-nowrap">
                              {scheduleLabel(order.schedule.state)}
                            </Badge>
                            {left && (
                              <Text size="xsmall" className="text-ui-fg-subtle">
                                {left}
                              </Text>
                            )}
                          </div>
                        </div>
                      ) : (
                        "-"
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      {order.current_proof ? (
                        <Badge size="2xsmall" color={proofStatusColor(order.current_proof.status)} className="whitespace-nowrap">
                          {`#${order.current_proof.number} ${proofStatusLabel(order.current_proof.status)}`}
                        </Badge>
                      ) : (
                        "-"
                      )}
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap">{formatTime(order.created_at)}</Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table>
          <div className="flex items-center justify-between px-6 py-3">
            <Text size="small" className="text-ui-fg-subtle">
              {rangeText(data.offset, data.team_orders.length, data.count)}
            </Text>
            <Table.Pagination
              count={data.count}
              pageSize={PAGE_SIZE}
              pageIndex={page}
              pageCount={Math.max(1, Math.ceil(data.count / PAGE_SIZE))}
              canPreviousPage={page > 0}
              canNextPage={(page + 1) * PAGE_SIZE < data.count}
              previousPage={() => goTo(page - 1)}
              nextPage={() => goTo(page + 1)}
            />
          </div>
        </>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Team orders",
  icon: UserGroup,
})

export default TeamOrdersPage
