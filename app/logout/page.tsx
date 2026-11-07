"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LogoutPage() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/session", { method: "DELETE" })
      .then(() => {
        setDone(true);
        window.dispatchEvent(new CustomEvent("repo-invent:auth-updated"));
        toast.success("Signed out of AWS Builder ID.");
      })
      .catch(() => setDone(true));
  }, []);

  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <Card>
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-2xl border-2 border-border bg-muted">
            {done ? <CheckCircle2 className="size-7 text-primary" /> : <LogOut className="size-7" />}
          </div>
          <CardTitle className="text-xl">
            {done ? "You're Signed Out" : "Signing Out…"}
          </CardTitle>
          <CardDescription>
            Your local AWS Builder ID OAuth tokens have been cleared. You can still browse all
            2,476 catalog sessions, 171 Vegas parties, and scan GitHub repositories.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Link href="/login">
            <Button className="w-full" size="lg">
              <LogIn className="size-4" />
              Sign In Again
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline" className="w-full">
              Back to Home
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
