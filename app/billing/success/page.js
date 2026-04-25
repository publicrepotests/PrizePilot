import SuccessClient from "./SuccessClient";

export default async function BillingSuccessPage({ searchParams }) {
  const resolvedParams = await searchParams;
  const plan = resolvedParams?.plan || "starter";

  return <SuccessClient plan={plan} />;
}
