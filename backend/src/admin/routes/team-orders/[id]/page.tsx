/**
 * The admin's page of one team order: the facts, the team list with its summary per size, every
 * proof (who signed, when, from which address, and the list that was signed), the add-ons and
 * reorders it is linked to, the record of status steps and the emails sent, and the buttons for the
 * admin's steps. The buttons are exactly the `actions` the backend sends for the order's status (a
 * step the rules refuse is not in the list); each asks for a confirmation first; the two by-hand
 * payment steps say so in their labels. All data comes from GET /admin/team-orders/:id, steps go to
 * POST /admin/team-orders/:id/steps.
 */
import { Badge, Button, Container, Heading, Table, Text, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { Link, useParams } from "react-router-dom"
import {
  daysLeftText,
  errorText,
  formatDay,
  formatTime,
  kindLabel,
  personText,
  playersText,
  proofStatusColor,
  proofStatusLabel,
  scheduleColor,
  scheduleLabel,
  shortHash,
  sizesText,
  statusColor,
  statusLabel,
  stepText,
  type Action,
  type Detail,
} from "../../../lib/team-orders"

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
      <div className="text-ui-fg-base txt-small">{children}</div>
    </div>
  )
}

function LinkedOrders({ items }: { items: { id: string; status: string; players: number; pieces: number }[] }) {
  if (items.length === 0) return <span>None</span>
  return (
    <ul className="flex flex-col gap-y-1">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-x-2">
          <Link to={`/team-orders/${item.id}`} className="text-ui-fg-interactive hover:underline">
            {item.id}
          </Link>
          <Badge size="2xsmall" color={statusColor(item.status)}>
            {statusLabel(item.status)}
          </Badge>
          <span className="text-ui-fg-subtle">{playersText(item.players, item.pieces)}</span>
        </li>
      ))}
    </ul>
  )
}

const TeamOrderPage = () => {
  const { id = "" } = useParams()
  const url = `/admin/team-orders/${id}`
  const queryKey = ["fitmyoutfit", "team-order", id]
  const queryClient = useQueryClient()
  const prompt = usePrompt()

  const { data, isLoading, error } = useQuery({ queryKey, queryFn: () => call(url) })
  const step = useMutation({
    mutationFn: (action: Action) => call(`${url}/steps`, { method: "POST", body: JSON.stringify({ action: action.id }) }),
    onSuccess: (answer) => {
      queryClient.setQueryData(queryKey, answer)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["fitmyoutfit", "team-orders"] })
      void queryClient.invalidateQueries({ queryKey })
    },
  })

  const press = async (action: Action) => {
    const confirmed = await prompt({
      title: action.label,
      description: action.confirm,
      confirmText: action.by_hand ? "Yes, I confirmed it" : "Confirm",
      cancelText: "Cancel",
    })
    if (confirmed) step.mutate(action)
  }

  if (error) {
    return (
      <Container>
        <Text size="small" className="text-ui-fg-error">
          {(error as Error).message}
        </Text>
        <div className="mt-2">
          <Link to="/team-orders" className="text-ui-fg-interactive hover:underline txt-small">
            Back to team orders
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

  const order = data.team_order
  const open = order.status === "draft" || order.status === "proof_sent"
  const currentProof = data.proofs.find((p) => p.status === "sent" || p.status === "signed") ?? null
  const left = open ? daysLeftText(data.schedule.latest_sign_standard ? daysFromToday(data) : null) : null

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-x-3">
            <Heading level="h1">{order.team_name}</Heading>
            <Badge color={statusColor(order.status)}>{statusLabel(order.status)}</Badge>
            {order.kind !== "order" && <Badge color="blue">{kindLabel(order.kind)}</Badge>}
          </div>
          <Link to="/team-orders" className="text-ui-fg-interactive hover:underline txt-small">
            All team orders
          </Link>
        </div>

        <div className="flex flex-col gap-y-2 px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            {data.actions.length === 0 ? (
              <Text size="small" className="text-ui-fg-subtle">
                No step for staff from this status.
              </Text>
            ) : (
              data.actions.map((action) => (
                <Button
                  key={action.id}
                  size="small"
                  variant={action.by_hand ? "secondary" : "primary"}
                  isLoading={step.isPending}
                  onClick={() => void press(action)}
                >
                  {action.label}
                </Button>
              ))
            )}
          </div>
          {data.actions.some((a) => a.by_hand) && (
            <Text size="small" className="text-ui-fg-subtle">
              Payments are not built yet. The buttons marked "by hand" only record that you confirmed the money arrived
              outside the store; nothing is checked.
            </Text>
          )}
          {step.error && (
            <Text size="small" className="text-ui-fg-error">
              {(step.error as Error).message}
            </Text>
          )}
        </div>

        <Row label="Organizer">{personText(data.organizer)}</Row>
        <Row label="Region">{data.region.name}</Row>
        <Row label="Product">{data.product.title || data.product.id}</Row>
        <Row label="Design version">
          {data.design_version.design_name || data.design_version.design_id}
          {data.design_version.version ? `, version ${data.design_version.version}` : ""}
          <div className="text-ui-fg-subtle">{data.design_version.id}</div>
        </Row>
        <Row label="Need by">
          {order.need_by_date ? (
            <div className="flex flex-wrap items-center gap-x-2">
              <span>{formatDay(order.need_by_date)}</span>
              <Badge size="2xsmall" color={scheduleColor(open ? data.schedule.state : (currentProof?.schedule_state ?? "none"))}>
                {scheduleLabel(open ? data.schedule.state : (currentProof?.schedule_state ?? "none"))}
              </Badge>
              {open && data.schedule.latest_sign_standard && (
                <span className="text-ui-fg-subtle">
                  latest day to sign {formatDay(data.schedule.latest_sign_standard)} (with rush{" "}
                  {formatDay(data.schedule.latest_sign_rush)})
                  {left ? `, ${left}` : ""}
                </span>
              )}
            </div>
          ) : (
            "No need-by date"
          )}
        </Row>
        <Row label="Rush">{order.rush_requested ? "Requested by the organizer" : "No"}</Row>
        <Row label="Prints">
          {[order.prints.name ? "player names" : null, order.prints.number ? "player numbers" : null]
            .filter(Boolean)
            .join(" and ") || "no names or numbers"}
        </Row>
        <Row label="Created">{formatTime(order.created_at)}</Row>
        <Row label="Linked orders">
          <div className="flex flex-col gap-y-2">
            {data.links.source && (
              <div>
                {order.kind === "add_on" ? "Add-on of " : "Reorder of "}
                <Link to={`/team-orders/${data.links.source.id}`} className="text-ui-fg-interactive hover:underline">
                  {data.links.source.team_name}
                </Link>{" "}
                <Badge size="2xsmall" color={statusColor(data.links.source.status)}>
                  {statusLabel(data.links.source.status)}
                </Badge>
              </div>
            )}
            <div>
              <Text size="small" weight="plus">
                Add-ons ({data.links.add_ons.count})
              </Text>
              <LinkedOrders items={data.links.add_ons.items} />
            </div>
            <div>
              <Text size="small" weight="plus">
                Reorders ({data.links.reorders.count})
              </Text>
              <LinkedOrders items={data.links.reorders.items} />
            </div>
          </div>
        </Row>
      </Container>

      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Team list</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {playersText(data.roster.summary.players, data.roster.summary.pieces)}. By size:{" "}
            {sizesText(data.roster.summary.by_size, data.roster.summary.other_sizes)}.
            {data.roster.problems.length > 0 ? ` ${data.roster.problems.length} problem(s) in the list.` : ""}
          </Text>
        </div>
        {data.roster.lines.length === 0 ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              The list is empty.
            </Text>
          </div>
        ) : (
          <LinesTable lines={data.roster.lines} />
        )}
      </Container>

      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Proofs</Heading>
        </div>
        {data.proofs.length === 0 && (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              No proof has been made.
            </Text>
          </div>
        )}
        {data.proofs.map((proof) => (
          <div key={proof.id} className="divide-y">
            <div className="flex items-center gap-x-3 px-6 py-3">
              <Text weight="plus">Proof {proof.number}</Text>
              <Badge size="2xsmall" color={proofStatusColor(proof.status)}>
                {proofStatusLabel(proof.status)}
              </Badge>
              <Text size="small" className="font-mono text-ui-fg-subtle" title={proof.hash}>
                {shortHash(proof.hash)}
              </Text>
            </div>
            <Row label="Made">{formatTime(proof.created_at)}</Row>
            {proof.status === "signed" || proof.signed_at ? (
              <>
                <Row label="Signed by">{`${proof.signed_name ?? "-"}${proof.signed_by ? `, account ${personText(proof.signed_by)}` : ""}`}</Row>
                <Row label="Signed at">{formatTime(proof.signed_at)}</Row>
                <Row label="Signed from address">{proof.signed_ip ?? "not recorded"}</Row>
                <Row label="Schedule when signed">
                  {proof.schedule_state ? scheduleLabel(proof.schedule_state) : "-"}
                  {proof.promised_delivery_date ? `, promised delivery ${formatDay(proof.promised_delivery_date)}` : ""}
                  {proof.rush ? " (rush)" : ""}
                </Row>
              </>
            ) : proof.closed_at ? (
              <Row label="Closed">{formatTime(proof.closed_at)}</Row>
            ) : null}
            <div className="px-6 py-3">
              <details>
                <summary className="cursor-pointer txt-small text-ui-fg-interactive">
                  The list as {proof.status === "signed" ? "signed" : "sent"} ({proof.snapshot.lines.length} players)
                </summary>
                <div className="mt-2">
                  <LinesTable lines={proof.snapshot.lines} />
                </div>
              </details>
            </div>
          </div>
        ))}
      </Container>

      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Record of steps</Heading>
        </div>
        {data.steps.length === 0 ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              No step yet.
            </Text>
          </div>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>When</Table.HeaderCell>
                <Table.HeaderCell>Who</Table.HeaderCell>
                <Table.HeaderCell>Step</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.steps.map((s) => (
                <Table.Row key={s.id}>
                  <Table.Cell>{formatTime(s.created_at)}</Table.Cell>
                  <Table.Cell>
                    {s.actor_label}
                    {s.actor_person ? `: ${personText(s.actor_person)}` : ""}
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex items-center gap-x-2">
                      <span>{stepText(s)}</span>
                      {s.by_hand && (
                        <Badge size="2xsmall" color="orange">
                          by hand
                        </Badge>
                      )}
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Container>

      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Emails to the organizer</Heading>
        </div>
        {data.emails.length === 0 ? (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              None sent yet.
            </Text>
          </div>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Email</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Sent</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.emails.map((e, i) => (
                <Table.Row key={`${e.kind}-${i}`}>
                  <Table.Cell>{e.kind.replace(/_/g, " ")}</Table.Cell>
                  <Table.Cell>
                    <Badge size="2xsmall" color={e.status === "sent" ? "green" : e.status === "failed" ? "red" : "grey"}>
                      {e.status}
                      {e.attempts > 1 ? ` (${e.attempts} tries)` : ""}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>{formatTime(e.sent_at)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Container>
    </div>
  )
}

function LinesTable({ lines }: { lines: { name: string; number: string; size: string; count: number; no_name: boolean; no_number: boolean }[] }) {
  return (
    <Table>
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>#</Table.HeaderCell>
          <Table.HeaderCell>Name</Table.HeaderCell>
          <Table.HeaderCell>Number</Table.HeaderCell>
          <Table.HeaderCell>Size</Table.HeaderCell>
          <Table.HeaderCell>Count</Table.HeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {lines.map((line, index) => (
          <Table.Row key={index}>
            <Table.Cell>{index + 1}</Table.Cell>
            <Table.Cell>{line.no_name ? <span className="text-ui-fg-subtle">no name</span> : line.name || "-"}</Table.Cell>
            <Table.Cell>{line.no_number ? <span className="text-ui-fg-subtle">no number</span> : line.number || "-"}</Table.Cell>
            <Table.Cell>{line.size || "-"}</Table.Cell>
            <Table.Cell>{line.count}</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  )
}

/** Days from the store's today (the answer's `schedule.today`) to the latest standard day to sign. */
function daysFromToday(data: Detail): number | null {
  const from = data.schedule.today
  const to = data.schedule.latest_sign_standard
  if (!from || !to) return null
  const parse = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)))
  return Math.round((parse(to) - parse(from)) / 86_400_000)
}

export default TeamOrderPage
