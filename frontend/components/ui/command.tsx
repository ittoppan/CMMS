"use client";

import * as React from "react";
import {
  Command as CommandRoot,
  CommandInput as CmdInput,
  CommandList as CmdList,
  CommandEmpty as CmdEmpty,
  CommandGroup as CmdGroup,
  CommandItem as CmdItem,
  CommandSeparator as CmdSeparator,
} from "cmdk";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { Dialog } from "@/components/ui/dialog";

function Command({ className, ...props }: React.ComponentProps<typeof CommandRoot>) {
  return (
    <CommandRoot
      data-slot="command"
      className={cn(
        "bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md",
        className
      )}
      {...props}
    />
  );
}

function CommandDialog({
  open,
  onClose,
  title = "ค้นหา",
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      className={cn("max-w-xl", className)}
      showCloseButton
    >
      {children}
    </Dialog>
  );
}

function CommandInput({ className, ...props }: React.ComponentProps<typeof CmdInput>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-9 items-center gap-2 border-b px-3"
    >
      <Search className="size-4 shrink-0 opacity-50" />
      <CmdInput
        data-slot="command-input"
        className={cn(
          "placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CmdList>) {
  return (
    <CmdList
      data-slot="command-list"
      className={cn(
        "max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto",
        className
      )}
      {...props}
    />
  );
}

function CommandEmpty({ ...props }: React.ComponentProps<typeof CmdEmpty>) {
  return (
    <CmdEmpty
      data-slot="command-empty"
      className="py-6 text-center text-sm"
      {...props}
    />
  );
}

function CommandGroup({ className, ...props }: React.ComponentProps<typeof CmdGroup>) {
  return (
    <CmdGroup
      data-slot="command-group"
      className={cn(
        "text-foreground [&_[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",
        className
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CmdSeparator>) {
  return (
    <CmdSeparator
      data-slot="command-separator"
      className={cn("bg-border -mx-1 h-px", className)}
      {...props}
    />
  );
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CmdItem>) {
  return (
    <CmdItem
      data-slot="command-item"
      className={cn(
        "data-[selected=true]:bg-accent/50 data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        className
      )}
      {...props}
    />
  );
}

function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "text-muted-foreground ml-auto text-xs tracking-widest",
        className
      )}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};