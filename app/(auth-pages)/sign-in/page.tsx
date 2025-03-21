'use client'

import { signInAction } from "@/app/actions";
import { FormMessage, Message } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { LayoutDashboard } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

export default function Login() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<Message | null>(null);
  const redirectTo = searchParams.get('redirectTo') || '/dashboard';

  useEffect(() => {
    // Processar mensagens nos parâmetros de busca
    const type = searchParams.get('type');
    const text = searchParams.get('text');
    
    if (type && text) {
      if (type === 'error') {
        setMessage({ error: text });
      } else if (type === 'success') {
        setMessage({ success: text });
      } else {
        setMessage({ message: text });
      }
    }
  }, [searchParams]);

  return (
    <div className="flex min-h-screen w-full justify-center items-center p-4 bg-gradient-to-b from-background to-muted/20">
      <div className="w-full max-w-md animate-fadeIn">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2">
            <div className="flex aspect-square size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <LayoutDashboard className="size-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-xl"><span className="text-red-800">Beta</span> Intelligence</span>
            </div>
          </div>
        </div>
        <Card className="border shadow-lg">
          <CardHeader className="flex flex-col items-center space-y-2 pb-2">
            <h1 className="text-2xl font-bold text-center">Bem-vindo</h1>
            <p className="text-muted-foreground text-sm text-center">
              Faça login para acessar o Beta Intelligence
            </p>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" action={signInAction}>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email
                </Label>
                <Input 
                  name="email" 
                  id="email"
                  placeholder="seu@email.com" 
                  className="transition-all focus:ring-2 focus:ring-primary/20" 
                  required 
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="password" className="text-sm font-medium">
                    Senha
                  </Label>
                  <Link
                    className="text-xs text-primary hover:underline transition-all"
                    href="/forgot-password"
                  >
                    Esqueceu a senha?
                  </Link>
                </div>
                <Input
                  type="password"
                  id="password"
                  name="password"
                  placeholder="Sua senha"
                  className="transition-all focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>
              
              <input type="hidden" name="redirectTo" value={redirectTo} />
              
              <SubmitButton 
                pendingText="Entrando..." 
                className="w-full bg-primary hover:bg-primary/90 transition-all"
              >
                Entrar
              </SubmitButton>
              
              {message && (
                <div className="animate-fadeIn">
                  <FormMessage message={message} />
                </div>
              )}
            </form>
          </CardContent>
          <CardFooter className="flex flex-col justify-center border-t pt-4 gap-3">
            <div className="flex items-center justify-center w-full">
              <p className="text-sm text-muted-foreground">
                Não tem uma conta?{" "}
                <Link href="/sign-up" className="text-primary font-medium hover:underline transition-all">
                  Cadastre-se
                </Link>
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Beta Intelligence &copy; {new Date().getFullYear()}
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
