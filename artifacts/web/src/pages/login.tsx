import { useState } from "react";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Label } from "@/components/ui";
import { AlertTriangle, Building2 } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("admin@inspectproof.com.au");
  const [password, setPassword] = useState("password123");
  const { login } = useAuth();
  
  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        login(data.token);
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ data: { email, password } });
  };

  return (
    <div className="min-h-screen w-full flex">
      {/* Left side - Dark Navy Branding */}
      <div className="hidden lg:flex w-1/2 bg-sidebar flex-col justify-between p-12 relative overflow-hidden">
        <div className="z-10">
          <div className="flex items-center gap-3 text-white mb-12">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="InspectProof" className="h-10 w-auto" />
          </div>
          <h1 className="text-4xl font-bold text-white max-w-md leading-tight mt-24">
            Faster inspections.<br />Clear compliance.<br />Better outcomes.
          </h1>
          <p className="text-sidebar-foreground/70 mt-6 text-lg max-w-md">
            All your inspection workflows in one streamlined platform.
          </p>
        </div>
        
        {/* Abstract background image from requirements */}
        <div className="absolute inset-0 opacity-20 mix-blend-overlay">
          <img 
            src={`${import.meta.env.BASE_URL}images/login-bg.png`} 
            alt="Abstract architectural lines" 
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 bg-background">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 text-sidebar mb-8 justify-center">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="InspectProof" className="h-8 w-auto" />
          </div>

          <Card className="border-0 shadow-2xl shadow-black/5">
            <CardHeader className="space-y-1 pb-8">
              <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
              <p className="text-sm text-muted-foreground">
                Enter your credentials to access the portal
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {loginMutation.isError && (
                  <div className="p-3 rounded bg-destructive/10 text-destructive text-sm flex items-center gap-2 mb-4 border border-destructive/20">
                    <AlertTriangle className="h-4 w-4" />
                    Invalid email or password
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-muted/50 border-muted-foreground/20 focus-visible:ring-primary"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <a href="#" className="text-xs text-secondary hover:text-secondary/80 font-medium">
                      Forgot password?
                    </a>
                  </div>
                  <Input 
                    id="password" 
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="bg-muted/50 border-muted-foreground/20 focus-visible:ring-primary"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full mt-6 h-11 text-base shadow-lg shadow-primary/25 hover:-translate-y-0.5 transition-all"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
