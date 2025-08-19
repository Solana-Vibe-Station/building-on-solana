"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Settings } from "lucide-react";
import { BuySettings, getBuySettingsFromFile, PriorityType, saveBuySettingsToFile } from "@/app/server/services/storageService";

export function BuySettingsDialog() {
  // State for dialog open/close
  const [isOpen, setIsOpen] = useState(false);

  // State for form values
  const [formState, setFormState] = useState<BuySettings>({
    solAmount: "0.01",
    slippage: "20",
    priorityType: "prio",
    priorityFee: "0.001",
    websocketAutoBuy: false,
  });

  // Load settings from server when dialog opens
  useEffect(() => {
    if (isOpen) {
      const fetchSettings = async () => {
        try {
          const settings = await getBuySettingsFromFile();
          setFormState({
            solAmount: settings.solAmount,
            slippage: settings.slippage,
            priorityType: settings.priorityType,
            priorityFee: settings.priorityFee,
            websocketAutoBuy: settings.websocketAutoBuy ?? false,
          });
        } catch (error) {
          console.error("Failed to fetch buy settings:", error);
        }
      };

      fetchSettings();
    }
  }, [isOpen]);

  // Handle form submission
  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();

    const settings: BuySettings = {
      solAmount: formState.solAmount.trim(),
      slippage: formState.slippage.trim(),
      priorityType: formState.priorityType,
      priorityFee: formState.priorityFee.trim(),
      websocketAutoBuy: formState.websocketAutoBuy,
    };

    try {
      await saveBuySettingsToFile(settings);
      setIsOpen(false);
    } catch (error) {
      console.error("Failed to save buy settings:", error);
      // You could add error handling UI here if needed
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="h-4 w-4 mr-2" />
          Buy Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Buy Settings</DialogTitle>
        </DialogHeader>
        <form onSubmit={submitForm}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="solAmount" className="text-right">
                SOL Amount
              </Label>
              <Input
                id="solAmount"
                type="number"
                step="0.001"
                min="0.001"
                value={formState.solAmount}
                onChange={(e) => setFormState({ ...formState, solAmount: e.target.value })}
                placeholder="Amount in SOL"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="slippage" className="text-right">
                Slippage %
              </Label>
              <Input
                id="slippage"
                type="number"
                step="0.001"
                min="0"
                max="100"
                value={formState.slippage}
                onChange={(e) => setFormState({ ...formState, slippage: e.target.value })}
                placeholder="Default"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="priorityType" className="text-right">
                Priority Type
              </Label>
              <Select
                value={formState.priorityType || "prio"}
                onValueChange={(value) => {
                  const priorityType = value as PriorityType;
                  const newState = { ...formState, priorityType };
                  setFormState(newState);
                }}
              >
                <SelectTrigger id="priorityType" className="col-span-3">
                  <SelectValue placeholder="Default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="jito">Jito</SelectItem>
                  <SelectItem value="prio">Prio (Default)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="priorityFee" className="text-right">
                {formState.priorityType === "jito" ? "Jito Fee" : formState.priorityType === "prio" ? "Prio Fee" : "Priority Fee"}
              </Label>
              <Input
                id="priorityFee"
                type="number"
                step="0.001"
                min="0"
                value={formState.priorityFee}
                onChange={(e) => setFormState({ ...formState, priorityFee: e.target.value })}
                placeholder="Default"
                className="col-span-3"
                disabled={!formState.priorityType}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4 border-red-500 border-2 p-4 rounded-md">
              <Label htmlFor="websocketAutoBuy" className="text-left">
                Websocket Auto-buy
              </Label>
              <div className="flex items-center space-x-2 col-span-3">
                <Checkbox
                  id="websocketAutoBuy"
                  checked={formState.websocketAutoBuy}
                  onCheckedChange={(checked) => setFormState({ ...formState, websocketAutoBuy: checked as boolean })}
                />
                <label htmlFor="websocketAutoBuy" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Enable auto-buy via websocket
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit">Save Changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
