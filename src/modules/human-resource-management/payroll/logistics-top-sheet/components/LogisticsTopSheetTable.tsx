import React, { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LogisticsTopSheetItem } from "../types/logistics-top-sheet.schema";
import { formatCurrency } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";

interface LogisticsTopSheetTableProps {
    data: LogisticsTopSheetItem[];
}

export const LogisticsTopSheetTable = ({ data }: LogisticsTopSheetTableProps) => {
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    const toggleRow = (id: string) => {
        const next = new Set(expandedRows);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setExpandedRows(next);
    };
    if (!data || data.length === 0) {
        return (
            <div className="flex h-64 items-center justify-center rounded-md border border-dashed text-muted-foreground">
                No payroll additions found for the selected cutoff.
            </div>
        );
    }

    return (
        <div className="rounded-md border bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader className="bg-muted/80">
                        <TableRow>
                            <TableHead className="font-semibold text-foreground whitespace-nowrap min-w-[200px]">EMPLOYEE NAME</TableHead>
                            <TableHead className="font-semibold text-foreground text-center">ID</TableHead>
                            <TableHead className="font-semibold text-foreground text-center">TYPE</TableHead>
                            <TableHead className="font-semibold text-foreground text-right min-w-[120px]">GROSS PAY</TableHead>
                            <TableHead className="font-semibold text-foreground text-right min-w-[120px]">ADDITIONS</TableHead>
                            <TableHead className="font-semibold text-foreground text-right min-w-[120px]">DEDUCTIONS</TableHead>
                            <TableHead className="font-semibold text-foreground text-right min-w-[120px]">NET PAY</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.map((item) => (
                            <React.Fragment key={item.id}>
                                <TableRow 
                                    className="hover:bg-muted/50 cursor-pointer" 
                                    onClick={() => toggleRow(item.id)}
                                >
                                    <TableCell className="font-medium flex items-center gap-2">
                                        {item.additionsList && item.additionsList.length > 0 ? (
                                            expandedRows.has(item.id) ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                        ) : (
                                            <span className="w-4 h-4"></span>
                                        )}
                                        {item.employeeName}
                                    </TableCell>
                                    <TableCell className="text-center text-muted-foreground">{item.employeeId}</TableCell>
                                    <TableCell className="text-center text-muted-foreground">{item.type}</TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                        {item.grossPay === 0 ? "PHP 0.00" : formatCurrency(item.grossPay)}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                        {item.additions === 0 ? "PHP 0.00" : formatCurrency(item.additions)}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                        {item.deductions === 0 ? "PHP 0.00" : formatCurrency(item.deductions)}
                                    </TableCell>
                                    <TableCell className="text-right font-bold text-foreground">
                                        {item.netPay === 0 ? "PHP 0.00" : formatCurrency(item.netPay)}
                                    </TableCell>
                                </TableRow>
                                {expandedRows.has(item.id) && item.additionsList && item.additionsList.length > 0 && (
                                    <TableRow className="bg-muted/30">
                                        <TableCell colSpan={7} className="py-3 px-12 text-sm text-muted-foreground">
                                            <ol className="list-decimal space-y-1 ml-4">
                                                {item.additionsList.map((add, idx) => {
                                                    // Make description multiline if it contains \n
                                                    const formattedDesc = add.description.split('\n').map((line, i) => (
                                                        <React.Fragment key={i}>
                                                            {line}
                                                            {i !== add.description.split('\n').length - 1 && <br />}
                                                        </React.Fragment>
                                                    ));
                                                    return (
                                                        <li key={idx} className="pl-2">
                                                            {formattedDesc} <span className="font-medium text-foreground ml-2">({formatCurrency(add.amount)})</span>
                                                        </li>
                                                    );
                                                })}
                                            </ol>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </React.Fragment>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
};
