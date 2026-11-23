/**
 * The admin's page of one design request: what the team sent (as plain text: nothing a stranger
 * typed is ever rendered as HTML, and their links are shown as text with a warning, not as live
 * links), the status buttons the rules allow (exactly the `allowed_next` the backend sends, each
 * asking for a confirmation), who is working on it, the staff notes, the record of changes, and a
 * link to the customer and their team orders when a signed-in customer asked. All data comes from
 * GET /admin/design-requests/:id; changes go to its /status, /notes and /assign routes.
 */
import { Badge, Button, Container, Heading, Table, Text, Textarea, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState, type ReactNode } from "react"
import { Link, useParams } from "react-router-dom"
import {
  confirmText,
  errorText,
  formatDay,
  formatTime,
  LINK_WARNING,
  piecesText,
  productLabel,
  regionLabel,
  statusColor,
  statusLabel,
  stepText,
  type Detail,
} from "../../../lib/design-requests"

async function call(url: string, init?: RequestInit): Promise<Detail> {
  const response = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...init,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(errorText(body, response.status))
  return body as Detail
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[180px_1fr] items-start gap-x-4 px-6 py-3">
      <Text size="small" weight="plus" className="text-ui-fg-subtle">
        {label}
      </Text>
      <div className="text-ui-fg-base txt-small break-words">{children}</div>
    </div>
  )
}

const DesignRequestPage = () => {
  const { id } = useParams()
  const url = `/admin/design-requests/${id}`
  const queryKey = ["fitmyoutfit", "design-request", id]
  const queryClient = useQueryClient()
  const prompt = usePrompt()
  const [notes, setNotes] = useState("")
  const [notesTouched, setNotesTouched] = useState(false)

  const { data, isLoading, error } = useQuery({ queryKey, queryFn: () => call(url) })
  const savedNotes = data?.design_request.staff_notes ?? ""
  useEffect(() => {
    if (!notesTouched) setNotes(savedNotes)
  }, [savedNotes, notesTouched])

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["fitmyoutfit", "design-requests"] })
    void queryClient.invalidateQueries({ queryKey })
  }
  const mutate = useMutation({
    mutationFn: (request: { path: string; body: unknown }) => call(`${url}/${request.path}`, { method: "POST", body: JSON.stringify(request.body) }),
    onSuccess: (answer) => queryClient.setQueryData(queryKey, answer),
    onSettled: refresh,
  })

  if (error) {
    return (
      <Container>
        <Text size="small" className="text-ui-fg-error">
          {(error as Error).message}
        </Text>
        <div className="mt-2">
          <Link to="/design-requests" className="text-ui-fg-interactive hover:underline txt-small">
            Back to design requests
          </Link>
        </div>
      </Container>
    )
  }
  if (isLoading || !data) {
    return (
      <Container>
        <Text size="small">Loading...</Text>
      </Container>
    )
  }

  const request = data.design_request
  const move = async (to: (typeof data.allowed_next)[number]) => {
    const confirmed = await prompt({
      title: `Move to "${to.label}"`,
      description: confirmText(request.status, to.to),
      confirmText: "Confirm",
      cancelText: "Cancel",
    })
    if (confirmed) mutate.mutate({ path: "status", body: { status: to.to } })
  }
  const saveNotes = () => {
    mutate.mutate({ path: "notes", body: { staff_notes: notes } }, { onSuccess: () => setNotesTouched(false) })
  }

  return (
    <div className="flex flex-col gap-y-3">
      <div>
        <Link to="/design-requests" className="text-ui-fg-interactive hover:underline txt-small">
          Design requests
        </Link>
      </div>

      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <Heading level="h1" data-testid="request-team">
              {request.team_name}
            </Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {request.reference} - received {formatTime(request.created_at)}
            </Text>
          </div>
          <Badge size="2xsmall" color={statusColor(request.status)} data-testid="request-status">
            {statusLabel(request.status)}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-6 py-4" data-testid="status-buttons">
          {data.allowed_next.map((next) => (
            <Button
              key={next.to}
              size="small"
              variant={next.to === data.allowed_next[0]?.to ? "primary" : "secondary"}
              disabled={mutate.isPending}
              onClick={() => void move(next)}
              data-testid={`move-${next.to}`}
            >
              {`Move to ${next.label}`}
            </Button>
          ))}
          {request.assigned_to ? (
            <Button size="small" variant="transparent" disabled={mutate.isPending} onClick={() => mutate.mutate({ path: "assign", body: { assign: false } })}>
              Let it go
            </Button>
          ) : (
            <Button size="small" variant="transparent" disabled={mutate.isPending} onClick={() => mutate.mutate({ path: "assign", body: { assign: true } })}>
              I am working on it
            </Button>
          )}
          {mutate.error ? (
            <Text size="small" className="text-ui-fg-error" role="alert">
              {mutate.error.message}
            </Text>
          ) : null}
        </div>

        <Row label="Working on it">{request.assigned_to_email ?? "Nobody yet"}</Row>
        <Row label="Contact">
          <span data-testid="request-contact">{request.contact_name}</span>
        </Row>
        <Row label="Email">
          <span className="break-all" data-testid="request-email">
            {request.email}
          </span>
        </Row>
        <Row label="Phone or WhatsApp">{request.phone ?? "-"}</Row>
        <Row label="Region">{regionLabel(request.region)}</Row>
        <Row label="Wants">
          {productLabel(request.product)}
          {request.pieces === null ? "" : `, ${piecesText(request.pieces)}`}
        </Row>
        <Row label="Need by">{formatDay(request.need_by_date)}</Row>
        <Row label="In their words">
          <pre className="whitespace-pre-wrap break-words font-sans" data-testid="request-message">
            {request.message}
          </pre>
        </Row>
        <Row label="Reference pictures">
          {request.reference_links.length === 0 ? (
            "None"
          ) : (
            <div className="flex flex-col gap-y-2">
              <Text size="small" className="text-ui-fg-error" data-testid="links-warning">
                {LINK_WARNING}
              </Text>
              {request.reference_links.map((link, index) => (
                <code key={index} className="break-all select-all" data-testid="request-link">
                  {link}
                </code>
              ))}
            </div>
          )}
        </Row>
        <Row label="Customer">
          {data.customer ? (
            <div className="flex flex-col gap-y-1">
              <Link to={`/customers/${data.customer.id}`} className="text-ui-fg-interactive hover:underline" data-testid="customer-link">
                {data.customer.name || data.customer.email || data.customer.id}
              </Link>
              <Text size="xsmall" className="text-ui-fg-subtle">
                {data.customer.email ?? ""}
              </Text>
            </div>
          ) : (
            "Not signed in when they asked"
          )}
        </Row>
        {data.customer ? (
          <Row label="Their team orders">
            {data.team_orders.length === 0 ? (
              "None yet"
            ) : (
              <ul className="flex flex-col gap-y-1">
                {data.team_orders.map((order) => (
                  <li key={order.id} className="flex items-center gap-x-2">
                    <Link to={`/team-orders/${order.id}`} className="text-ui-fg-interactive hover:underline">
                      {order.team_name}
                    </Link>
                    <Badge size="2xsmall" color="grey">
                      {order.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Row>
        ) : null}
      </Container>

      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Staff notes</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Only staff see these. They are never shown to the team.
          </Text>
        </div>
        <div className="flex flex-col gap-y-3 px-6 py-4">
          <Textarea
            aria-label="Staff notes"
            value={notes}
            rows={4}
            onChange={(event) => {
              setNotes(event.target.value)
              setNotesTouched(true)
            }}
          />
          <div>
            <Button size="small" variant="secondary" disabled={mutate.isPending || notes === savedNotes} onClick={saveNotes} data-testid="save-notes">
              Save notes
            </Button>
          </div>
        </div>
      </Container>

      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Record of changes</Heading>
        </div>
        {data.steps.length === 0 ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              No status changes yet.
            </Text>
          </div>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>When</Table.HeaderCell>
                <Table.HeaderCell>Change</Table.HeaderCell>
                <Table.HeaderCell>By</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.steps.map((step, index) => (
                <Table.Row key={index} data-testid="request-step">
                  <Table.Cell className="whitespace-nowrap">{formatTime(step.at)}</Table.Cell>
                  <Table.Cell>{stepText(step)}</Table.Cell>
                  <Table.Cell>{step.by_email ?? step.by}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Container>
    </div>
  )
}

export default DesignRequestPage
