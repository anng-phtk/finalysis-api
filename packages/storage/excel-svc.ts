import * as XLSX from 'xlsx';
import * as fs from 'fs/promises';
import * as path from 'path';
import { type ColumnarGrid } from '../utils/types.js';
import { LOCAL_DMP_PATH } from './upload-svc.js';

/**
 * Exports a ColumnarGrid to a formatted Excel file and saves it 
 * directly to the local DMP folder on G: drive.
 */
export async function exportGridToExcel(ticker: string, grid: ColumnarGrid) {
    // Generate a unique filename
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `${ticker}_fundamentals_${dateStr}_${Date.now()}.xlsx`;
    const targetPath = path.join(LOCAL_DMP_PATH, fileName);

    const periods = grid.reportedPeriods;
    
    // Header Row: Metric name, then the period dates
    const headers = ['Metric', ...periods];
    const data = [headers];

    // Get all metric keys (except reportedPeriods which is our header)
    // We filter then sort them to preserve a sane order if needed, 
    // but the current order in the object is usually fine.
    const metrics = Object.keys(grid).filter(key => key !== 'reportedPeriods');

    metrics.forEach(metric => {
        const row = [metric, ...(grid[metric] as any[])];
        data.push(row);
    });

    // Create a new workbook and worksheet
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Financial Data');

    // Generate the buffer for the Excel file
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    try {
        // Ensure the directory exists
        await fs.mkdir(LOCAL_DMP_PATH, { recursive: true });
        
        // Write the buffer to the G: drive
        await fs.writeFile(targetPath, buf);
        
        console.log(`[SUCCESS] Excel report saved to: ${targetPath}`);
        return targetPath;
    } catch (error) {
        console.error("Excel Export Failed:", error);
        throw error;
    }
}
