import logo from "@/assets/logo.svg";
import { ClayButton } from "@/components/clay/ClayButton";
import { motion } from "framer-motion";
import { useNavigate } from "react-router";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="clay-bg flex min-h-screen flex-col items-center justify-center p-6 text-center"
    >
      <span className="clay-orb size-16 bg-white p-3">
        <img src={logo} alt="" className="size-full" />
      </span>
      <h1 className="clay-title mt-6 text-6xl">404</h1>
      <p className="mt-2 text-lg font-semibold">This page got squished flat</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        The page you're looking for doesn't exist — but your next tailored
        resume is still waiting.
      </p>
      <ClayButton className="mt-6" onClick={() => navigate("/")}>
        Back to home
      </ClayButton>
    </motion.div>
  );
}
