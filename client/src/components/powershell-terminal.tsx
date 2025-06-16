import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Terminal, Play, Trash2, Save } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CommandResult } from "@/lib/types";

export function PowerShellTerminal() {
  const [command, setCommand] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: history, isLoading } = useQuery({
    queryKey: ['/api/commands/history'],
    refetchInterval: 5000,
  });

  const executeCommandMutation = useMutation({
    mutationFn: async (cmd: string) => {
      const response = await fetch('/api/commands/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command: cmd }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to execute command');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/commands/history'] });
      queryClient.refetchQueries({ queryKey: ['/api/commands/history'] });
      setCommand("");
      setCommandHistory(prev => [...prev, command]);
      setHistoryIndex(-1);
      
      // Scroll to bottom
      setTimeout(() => {
        if (terminalRef.current) {
          terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
      }, 100);
    },
    onError: (error) => {
      toast({
        title: "Command Failed",
        description: error instanceof Error ? error.message : "Failed to execute command",
        variant: "destructive",
      });
    },
  });

  const clearHistoryMutation = useMutation({
    mutationFn: () => apiRequest('DELETE', '/api/commands/history'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/commands/history'] });
      toast({
        title: "History Cleared",
        description: "Command history has been cleared",
      });
    },
  });

  const handleExecute = () => {
    if (command.trim()) {
      executeCommandMutation.mutate(command.trim());
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleExecute();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setCommand(commandHistory[commandHistory.length - 1 - newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCommand(commandHistory[commandHistory.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommand("");
      }
    }
  };

  const insertCommand = (cmd: string) => {
    setCommand(cmd);
    inputRef.current?.focus();
  };

  const formatOutput = (output: string) => {
    if (!output) return "";
    return output.split('\n').map((line, i) => (
      <div key={i}>{line || '\u00A0'}</div>
    ));
  };

  const quickCommands = [
    "Get-Module -ListAvailable",
    "Connect-ExchangeOnline",
    "Get-PlaceV3 -Type Building",
    "New-Place -Type Building",
    "Get-PlaceV3 -Type Floor",
    "Get-PlaceV3 -Type Section",
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-neutral-800 rounded-lg flex items-center justify-center">
              <Terminal className="text-white" size={16} />
            </div>
            <CardTitle>PowerShell Console</CardTitle>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => clearHistoryMutation.mutate()}
              disabled={clearHistoryMutation.isPending}
            >
              <Trash2 size={16} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const content = history?.map((h: any) => 
                  `PS> ${h.command}\n${h.output}\n`
                ).join('\n');
                const blob = new Blob([content || ''], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'powershell-history.txt';
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Save size={16} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Command Input */}
        <div className="flex space-x-3">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-3 text-muted-foreground text-sm font-mono">
              PS&gt;
            </span>
            <Input
              ref={inputRef}
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyPress}
              className="pl-12 font-mono text-sm"
              placeholder="Enter PowerShell command..."
              disabled={executeCommandMutation.isPending}
            />
          </div>
          <Button
            onClick={handleExecute}
            disabled={!command.trim() || executeCommandMutation.isPending}
          >
            <Play size={16} className="mr-2" />
            Execute
          </Button>
        </div>

        {/* Terminal Output */}
        <div
          ref={terminalRef}
          className="bg-neutral-900 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm text-neutral-100"
        >
          <div className="text-green-500 text-xs mb-2">
            Microsoft Places Admin Console - Ready
          </div>
          <div className="text-neutral-400 text-xs mb-4">
            Type PowerShell commands above and press Execute or Enter
          </div>

          {isLoading ? (
            <div className="text-neutral-400">Loading command history...</div>
          ) : (
            history?.slice().reverse().map((item: any) => (
              <div key={item.id} className="mb-3">
                <div className="text-blue-400">PS&gt; {item.command}</div>
                {item.status === 'error' ? (
                  <div className="mt-1 pl-4 text-red-400">
                    {formatOutput(item.output)}
                  </div>
                ) : (
                  <div className="mt-1 pl-4 text-neutral-300">
                    {formatOutput(item.output)}
                  </div>
                )}
              </div>
            ))
          )}

          {executeCommandMutation.isPending && (
            <div className="mb-3">
              <div className="text-blue-400">PS&gt; {command}</div>
              <div className="mt-1 pl-4 text-orange-400">
                <div>Executing command...</div>
              </div>
            </div>
          )}

          <div className="flex items-center">
            <span className="text-blue-400">PS&gt;</span>
            <div className="w-2 h-4 bg-neutral-100 ml-1 animate-pulse"></div>
          </div>
        </div>

        {/* Quick Commands */}
        <div className="flex flex-wrap gap-2">
          {quickCommands.map((cmd) => (
            <Button
              key={cmd}
              variant="secondary"
              size="sm"
              onClick={() => insertCommand(cmd)}
              className="text-xs"
            >
              {cmd}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
