import { createFileRoute } from "@tanstack/react-router";
import { PayPilotDesk } from "@/components/paypilot/desk";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <PayPilotDesk />;
}
