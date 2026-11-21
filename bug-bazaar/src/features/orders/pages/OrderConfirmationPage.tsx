import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { getOrder, isAbortError } from "../../../api/index.ts";
import LoadGate from "../../../components/LoadGate.tsx";
import { LoadingState, NotFoundState } from "../../../components/states.tsx";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.ts";
import type { Order, OrderStatus } from "../../../types/api.ts";
import { requestState, type RequestState } from "../../../types/request.ts";
import { formatPrice } from "../../../utils/formatPrice.ts";
import { toError } from "../../../utils/toError.ts";

export const POLL_INTERVAL_MS = 3000;

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "queued", label: "Order received" },
  { status: "processing", label: "Preparing your order" },
  { status: "completed", label: "Ready to ship" },
];

function placedSummary(state: unknown): { total: number; count: number } | null {
  if (typeof state !== "object" || state === null) return null;
  const { placedTotal, placedCount } = state as Record<string, unknown>;
  return typeof placedTotal === "number" && typeof placedCount === "number"
    ? { total: placedTotal, count: placedCount }
    : null;
}

export default function OrderConfirmationPage() {
  const { id = "" } = useParams<{ id: string }>();
  const summary = placedSummary(useLocation().state as unknown);
  const [order, setOrder] = useState<RequestState<Order>>(requestState.loading());
  const [attempt, setAttempt] = useState(0);
  useDocumentTitle(`Order ${id}`);

  // Poll until the order completes. Cleanup aborts the in-flight request and
  // clears the pending timer, so nothing keeps polling after the page closes (D2-4).
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const latest = await getOrder(id, { signal: controller.signal });
        setOrder(requestState.success(latest));
        if (latest.status !== "completed") timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return;
        setOrder(requestState.error(toError(error)));
      }
    };
    void poll();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, attempt]);

  return (
    <section aria-labelledby="order-heading" className="order">
      <h2 id="order-heading" className="page-heading">
        {summary ? "Thank you! Your order is placed." : `Order ${id}`}
      </h2>
      <LoadGate
        state={order}
        onRetry={() => {
          setOrder(requestState.loading());
          setAttempt((current) => current + 1);
        }}
        subject="this order"
        loading={<LoadingState label="Loading your order…" variant="detail" />}
        notFound={
          <NotFoundState
            title="Order not found"
            description="We couldn't find that order on your account."
            action={
              <Link to="/" className="button button--primary">
                Continue shopping
              </Link>
            }
          />
        }
      >
        {(data) => (
          <div className="order__card">
            <dl className="order__facts">
              <dt>Order number</dt>
              <dd data-testid="order-id">{data.id}</dd>
              {summary && (
                <>
                  <dt>Items</dt>
                  <dd>{summary.count}</dd>
                  <dt>Total</dt>
                  <dd>{formatPrice(summary.total)}</dd>
                </>
              )}
            </dl>
            {/* Polite live region: status changes are announced without moving focus. */}
            <p role="status" className="order__status" data-testid="order-status">
              Status: {STEPS.find((step) => step.status === data.status)?.label}
            </p>
            <ol className="order__steps">
              {STEPS.map((step, index) => {
                const reached = index <= STEPS.findIndex((s) => s.status === data.status);
                return (
                  <li
                    key={step.status}
                    className={reached ? "order__step order__step--done" : "order__step"}
                  >
                    <span aria-hidden="true">{reached ? "✓" : "○"}</span> {step.label}
                    <span className="visually-hidden">{reached ? " (done)" : " (pending)"}</span>
                  </li>
                );
              })}
            </ol>
            <Link to="/" className="button button--primary">
              Continue shopping
            </Link>
          </div>
        )}
      </LoadGate>
    </section>
  );
}
