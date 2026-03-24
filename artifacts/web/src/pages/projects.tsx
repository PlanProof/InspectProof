import { useState } from "react";
import { useListProjects, useCreateProject } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, Label } from "@/components/ui";
import { Search, Plus, Building } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { Link } from "wouter";

export default function Projects() {
  const [search, setSearch] = useState("");
  const { data: projects, isLoading, refetch } = useListProjects({});
  const [isNewOpen, setIsNewOpen] = useState(false);

  const filtered = projects?.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.siteAddress.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-sidebar tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage construction projects and certifications.</p>
        </div>
        <Button onClick={() => setIsNewOpen(true)} className="shadow-lg shadow-primary/20">
          <Plus className="mr-2 h-4 w-4" /> New Project
        </Button>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="p-4 border-b flex items-center gap-4 bg-muted/20">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search projects..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading projects...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Inspections</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered?.map((project) => (
                <TableRow key={project.id} className="group cursor-pointer">
                  <TableCell>
                    <Link href={`/projects/${project.id}`} className="block">
                      <div className="font-semibold text-sidebar group-hover:text-secondary transition-colors">
                        {project.name}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Building className="h-3 w-3" />
                        {project.siteAddress}, {project.suburb}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">{project.projectType.replace('_', ' ')}</TableCell>
                  <TableCell>
                    <StatusBadge status={project.status} />
                  </TableCell>
                  <TableCell className="capitalize text-sm">{project.stage.replace('_', ' ')}</TableCell>
                  <TableCell>{project.clientName}</TableCell>
                  <TableCell className="text-right font-medium">{project.totalInspections}</TableCell>
                </TableRow>
              ))}
              {filtered?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center p-8 text-muted-foreground">
                    No projects found matching "{search}"
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <NewProjectDialog open={isNewOpen} onOpenChange={setIsNewOpen} onSuccess={refetch} />
    </AppLayout>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, "default" | "success" | "warning" | "secondary"> = {
    active: "success",
    on_hold: "warning",
    completed: "default",
    archived: "secondary"
  };
  return (
    <Badge variant={map[status] || "default"} className="capitalize">
      {status.replace('_', ' ')}
    </Badge>
  );
}

function NewProjectDialog({ open, onOpenChange, onSuccess }: { open: boolean, onOpenChange: (o: boolean) => void, onSuccess: () => void }) {
  const mutation = useCreateProject({
    mutation: {
      onSuccess: () => {
        onSuccess();
        onOpenChange(false);
      }
    }
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    mutation.mutate({
      data: {
        name: fd.get('name') as string,
        siteAddress: fd.get('siteAddress') as string,
        suburb: fd.get('suburb') as string,
        state: fd.get('state') as string,
        postcode: fd.get('postcode') as string,
        clientName: fd.get('clientName') as string,
        buildingClassification: fd.get('buildingClassification') as string,
        projectType: fd.get('projectType') as any,
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Project Name</Label>
              <Input name="name" required placeholder="e.g. Smith Residence" />
            </div>
            <div className="space-y-2">
              <Label>Client Name</Label>
              <Input name="clientName" required />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Site Address</Label>
              <Input name="siteAddress" required />
            </div>
            <div className="space-y-2">
              <Label>Suburb</Label>
              <Input name="suburb" required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>State</Label>
                <Input name="state" required defaultValue="NSW" />
              </div>
              <div className="space-y-2">
                <Label>Postcode</Label>
                <Input name="postcode" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Project Type</Label>
              <select name="projectType" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" required>
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="industrial">Industrial</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Building Classification</Label>
              <Input name="buildingClassification" required placeholder="e.g. Class 1a" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
