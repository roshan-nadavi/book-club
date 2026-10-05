import LoginForm from "@/components/auth/LoginForm";
import GuestAccessButton from "@/components/auth/GuestAccessButton";

export const metadata = { title: "Sign in — Book Club" };

export default function LoginPage() {
  return (
    <>
      <GuestAccessButton />
      <LoginForm />
    </>
  );
}
