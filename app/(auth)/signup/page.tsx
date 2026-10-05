import SignupForm from "@/components/auth/SignupForm";
import GuestAccessButton from "@/components/auth/GuestAccessButton";

export const metadata = { title: "Create account — Book Club" };

export default function SignupPage() {
  return (
    <>
      <GuestAccessButton />
      <SignupForm />
    </>
  );
}
