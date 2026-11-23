/**
 * The admin's design-help queue (menu entry "Design requests"): newest first, paged, filtered by
 * status, with the number of new requests in the header. Each row opens the request's page
 * (./[id]/page.tsx). All data comes from GET /admin/design-requests; the words and colours are in
 * ../../lib/design-requests.ts. What a stranger typed is shown as text only.
 */
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { PencilSquare } from "@medusajs/icons"
import { Badge, Container, Heading, Select, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  errorText,
  formatDay,
  formatTime,
  piecesText,
  productLabel,
  rangeText,
  regionLabel,
  statusColor,
  statusLabel,
  STATUSES,
  type ListAnswer,
} from "../../lib/design-requests"

const PAGE_SIZE = 20
const ALL = "all"

async function fetchList(status: string, page: number): Promise<ListAnswer> {
  const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) })
  if (status !== ALL) query.set("status", status)
  const response = await fetch(`/admin/design-requests?${query.toString()}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(errorText(body, response.status))
  return body as ListAnswer
}

const DesignRequestsPage = () => {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const status = params.get("status") ?? ALL
  const page = Math.max(0, Number.parseInt(params.get("page") ?? "0", 10) || 0)

  const { data, isLoading, error } = useQuery({
    queryKey: ["fitmyoutfit", "design-requests", status, page],
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
          <div className="flex items-center gap-x-3">
            <Heading level="h1">Design requests</Heading>
            {data ? (
              <Badge size="2xsmall" color={data.new_count > 0 ? "orange" : "grey"} data-testid="new-count">
                {data.new_count} new
              </Badge>
            ) : null}
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            Teams asking for free design help, newest first. What they typed is shown as plain text.
          </Text>
        </div>
        <div className="w-[220px]">
          <Select value={status} onValueChange={setFilter}>
            <Select.Trigger aria-label="Filter by status">
              <Select.Value placeholder="All statuses" />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value={ALL}>All statuses{data ? ` (${STATUSES.reduce((sum, s) => sum + data.counts[s], 0)})` : ""}</Select.Item>
              {STATUSES.map((s) => (
                <Select.Item key={s} value={s}>
                  {statusLabel(s)}
                  {data ? ` (${data.counts[s]})` : ""}
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
      ) : data.design_requests.length === 0 ? (
        <div className="px-6 py-8">
          <Text size="small" className="text-ui-fg-subtle">
            No design requests{status === ALL ? "" : ` with status "${statusLabel(status)}"`}.
          </Text>
        </div>
      ) : (
        <>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Reference</Table.HeaderCell>
                <Table.HeaderCell>Team</Table.HeaderCell>
                <Table.HeaderCell>Contact</Table.HeaderCell>
                <Table.HeaderCell>Region</Table.HeaderCell>
                <Table.HeaderCell>Wants</Table.HeaderCell>
                <Table.HeaderCell>Need by</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Working on it</Table.HeaderCell>
                <Table.HeaderCell>Received</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.design_requests.map((request) => (
                <Table.Row
                  key={request.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/design-requests/${request.id}`)}
                  data-testid="design-request-row"
                >
                  <Table.Cell className="whitespace-nowrap">{request.reference}</Table.Cell>
                  <Table.Cell>{request.team_name}</Table.Cell>
                  <Table.Cell>
                    <div>{request.contact_name}</div>
                    <Text size="xsmall" className="break-all text-ui-fg-subtle">
                      {request.email}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>{regionLabel(request.region)}</Table.Cell>
                  <Table.Cell>
                    {productLabel(request.product)}
                    {request.pieces === null ? "" : `, ${piecesText(request.pieces)}`}
                  </Table.Cell>
                  <Table.Cell className="whitespace-nowrap">{formatDay(request.need_by_date)}</Table.Cell>
                  <Table.Cell>
                    <Badge size="2xsmall" color={statusColor(request.status)} className="whitespace-nowrap">
                      {statusLabel(request.status)}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>{request.assigned_to_email ?? "-"}</Table.Cell>
                  <Table.Cell className="whitespace-nowrap">{formatTime(request.created_at)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
          <div className="flex items-center justify-between px-6 py-3">
            <Text size="small" className="text-ui-fg-subtle">
              {rangeText(data.offset, data.design_requests.length, data.count)}
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
  label: "Design requests",
  icon: PencilSquare,
})

export default DesignRequestsPage
