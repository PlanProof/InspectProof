import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListIssues } from "@workspace/api-client-react";
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, Dialog, DialogContent, DialogHeader, DialogTitle, Label } from "@/components/ui";
import { Search, Plus, ExternalLink, Camera } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function Issues() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [severityFilter, setSeverityFilter] = useState<string>("All");
  const { data: issues, isLoading } = useListIssues({});
  const [selectedIssue, setSelectedIssue] = useState<any>(null);

  const filtered = issues?.filter(issue => {
    const matchesSearch = issue.title.toLowerCase().includes(search.toLowerCase()) || issue.description.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "All" || issue.status === statusFilter.toLowerCase().replace(" ", "_");
    const matchesSeverity = severityFilter === "All" || issue.severity === severityFilter.toLowerCase();
    return matchesSearch && matchesStatus && matchesSeverity;
  });

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-sidebar tracking-tight">Issues & Defects</h1>
          <p className="text-muted-foreground mt-1">Track and manage non-compliances and defects.</p>
        </div>
        <Button className="shadow-lg shadow-primary/20">
          <Plus className="mr-2 h-4 w-4" /> New Issue
        </Button>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden mb-6">
        <div className="p-4 border-b flex flex-wrap items-center gap-4 bg-muted/20">
          <div className="relative flex-1 min-w-[250px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search issues..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>
          
          <div className="flex items-center gap-2">
            {["All", "Open", "In Progress", "Resolved"].map(status => (
              <Button 
                key={status} 
                variant={statusFilter === status ? "default" : "outline"} 
                size="sm"
                onClick={() => setStatusFilter(status)}
                className={statusFilter === status ? "bg-sidebar text-white hover:bg-sidebar/90" : ""}
              >
                {status}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <select 
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value)}
              className="flex h-9 w-[150px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="All">All Severities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading issues...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead className="text-right">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered?.map((issue) => (
                <TableRow key={issue.id} className="group cursor-pointer hover:bg-muted/50" onClick={() => setSelectedIssue(issue)}>
                  <TableCell className="font-mono text-xs text-muted-foreground">#{issue.id}</TableCell>
                  <TableCell className="font-medium text-sidebar">{issue.title}</TableCell>
                  <TableCell>
                    <SeverityBadge severity={issue.severity} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={issue.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{issue.projectName}</TableCell>
                  <TableCell>{issue.assigneeName || <span className="text-muted-foreground italic">Unassigned</span>}</TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">{formatDate(issue.createdAt)}</TableCell>
                </TableRow>
              ))}
              {filtered?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center p-8 text-muted-foreground">
                    No issues found matching filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={!!selectedIssue} onOpenChange={(open) => !open && setSelectedIssue(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-muted-foreground">#{selectedIssue?.id}</span>
              <DialogTitle>{selectedIssue?.title}</DialogTitle>
            </div>
          </DialogHeader>
          
          {selectedIssue && (
            <div className="space-y-6 mt-4">
              <div className="flex flex-wrap gap-4 items-center">
                <SeverityBadge severity={selectedIssue.severity} />
                <StatusBadge status={selectedIssue.status} />
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <ExternalLink className="h-4 w-4" /> 
                  {selectedIssue.projectName}
                </div>
                {selectedIssue.photos?.length > 0 && (
                  <div className="text-sm text-muted-foreground flex items-center gap-1 ml-auto">
                    <Camera className="h-4 w-4" /> 
                    {selectedIssue.photos.length} Photos
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Description</Label>
                <div className="bg-muted/30 p-4 rounded-md border text-sm text-sidebar">
                  {selectedIssue.description || "No description provided."}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Assigned To</Label>
                  <div className="text-sm font-medium">{selectedIssue.assigneeName || "Unassigned"}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Created On</Label>
                  <div className="text-sm">{formatDate(selectedIssue.createdAt)}</div>
                </div>
              </div>

              {selectedIssue.resolutionNotes && (
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">Resolution Notes</Label>
                  <div className="bg-blue-50/50 p-4 rounded-md border border-blue-100 text-sm">
                    {selectedIssue.resolutionNotes}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const normalized = severity.toLowerCase();
  const getStyles = () => {
    switch(normalized) {
      case "critical": return "bg-red-500 text-white border-transparent";
      case "high": return "bg-orange-500 text-white border-transparent";
      case "medium": return "bg-yellow-500 text-white border-transparent";
      case "low": return "bg-blue-500 text-white border-transparent";
      default: return "bg-gray-500 text-white border-transparent";
    }
  };
  return <Badge className={`capitalize ${getStyles()}`}>{severity}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase().replace('_', ' ');
  const getStyles = () => {
    switch(normalized) {
      case "open": return "border-red-200 bg-red-50 text-red-700";
      case "in progress": return "border-blue-200 bg-blue-50 text-blue-700";
      case "resolved": return "border-green-200 bg-green-50 text-green-700";
      default: return "border-gray-200 bg-gray-50 text-gray-700";
    }
  };
  return <Badge variant="outline" className={`capitalize ${getStyles()}`}>{normalized}</Badge>;
}
