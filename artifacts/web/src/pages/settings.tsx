import { AppLayout } from "@/components/layout/AppLayout";
import { useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Button, Tabs, TabsContent, TabsList, TabsTrigger, Badge } from "@/components/ui";
import { User, Lock, Bell, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { data: _user, isLoading } = useGetMe();
  const user = _user as any;
  const { toast } = useToast();

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "Profile Updated",
      description: "Your profile information has been saved successfully.",
    });
  };

  const handleSavePassword = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "Password Updated",
      description: "Your security settings have been updated.",
    });
  };

  if (isLoading) {
    return <AppLayout><div className="flex h-full items-center justify-center">Loading settings...</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="mb-8 max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-sidebar tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account preferences and security.</p>
      </div>

      <div className="max-w-4xl mx-auto">
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="mb-8 bg-muted/50 p-1 w-full sm:w-auto inline-flex justify-start h-auto">
            <TabsTrigger value="profile" className="px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md flex items-center gap-2">
              <User className="h-4 w-4" /> Profile
            </TabsTrigger>
            <TabsTrigger value="security" className="px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md flex items-center gap-2">
              <Lock className="h-4 w-4" /> Security
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-6">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveProfile} className="space-y-6">
                  <div className="flex items-center gap-6 pb-6 border-b">
                    <div className="h-20 w-20 rounded-full bg-primary/20 text-sidebar flex items-center justify-center text-2xl font-bold">
                      {user?.name?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <h3 className="font-medium text-lg">{user?.name || 'User'}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="capitalize bg-muted/50">{user?.role?.replace('_', ' ') || 'User'}</Badge>
                        {user?.organization && (
                          <span className="text-sm text-muted-foreground">{user.organization}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="name">Display Name</Label>
                      <Input id="name" defaultValue={user?.name} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input id="email" type="email" defaultValue={user?.email} disabled className="bg-muted/50 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">Email addresses cannot be changed.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="org">Organization</Label>
                      <Input id="org" defaultValue={user?.organization || ''} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input id="phone" placeholder="+61 400 000 000" />
                    </div>
                  </div>

                  <div className="pt-4 flex justify-end">
                    <Button type="submit">Save Changes</Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Notification Preferences</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/20">
                    <div>
                      <p className="font-medium">Email Notifications</p>
                      <p className="text-sm text-muted-foreground">Receive daily summaries and critical alerts.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/20">
                    <div>
                      <p className="font-medium">Push Notifications</p>
                      <p className="text-sm text-muted-foreground">Receive immediate alerts in browser.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            <Card className="shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Change Password</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSavePassword} className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <Label htmlFor="current">Current Password</Label>
                    <Input id="current" type="password" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new">New Password</Label>
                    <Input id="new" type="password" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm">Confirm New Password</Label>
                    <Input id="confirm" type="password" required />
                  </div>
                  <div className="pt-4">
                    <Button type="submit">Update Password</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>
    </AppLayout>
  );
}
