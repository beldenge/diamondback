// Ghidra headless post-script: dump every function's decompiled C, a
// function table, and every string with the functions that reference it.
//
//   analyzeHeadless <proj> Dust -import DF.EXE -postScript ExportDecomp.java <outdir>
//
// Output (all generated, under dustdecompile/out/ghidra/<binary>/):
//   decomp.c        one C listing per function, "// ==== name @ addr" headers
//   functions.tsv   addr, name, size, callers, callees
//   strings.tsv     addr, string, referencing functions
//   datarefs.tsv    data address, referencing function (for BSS/globals)
//@category Dust
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileOptions;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.address.Address;
import ghidra.program.model.data.DataType;
import ghidra.program.model.data.StringDataInstance;
import ghidra.program.model.listing.Data;
import ghidra.program.model.listing.DataIterator;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;
import ghidra.program.model.symbol.ReferenceManager;
import ghidra.program.model.symbol.RefType;
import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

public class ExportDecomp extends GhidraScript {
    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        File outDir = new File(args.length > 0 ? args[0] : "ghidra-out");
        outDir.mkdirs();
        println("ExportDecomp -> " + outDir.getAbsolutePath());

        exportFunctions(new File(outDir, "functions.tsv"));
        exportStrings(new File(outDir, "strings.tsv"));
        exportDataRefs(new File(outDir, "datarefs.tsv"));
        exportDecomp(new File(outDir, "decomp.c"));
    }

    private String funcAt(Address a) {
        Function f = getFunctionContaining(a);
        return f == null ? "?" : f.getName() + "@" + f.getEntryPoint();
    }

    private void exportFunctions(File out) throws Exception {
        try (PrintWriter pw = new PrintWriter(new FileWriter(out))) {
            pw.println("addr\tname\tsize\tcallers\tcallees");
            FunctionIterator it = currentProgram.getFunctionManager().getFunctions(true);
            while (it.hasNext()) {
                Function f = it.next();
                Set<String> callers = new TreeSet<>();
                for (Function c : f.getCallingFunctions(monitor)) callers.add(c.getName());
                Set<String> callees = new TreeSet<>();
                for (Function c : f.getCalledFunctions(monitor)) callees.add(c.getName());
                pw.println(f.getEntryPoint() + "\t" + f.getName() + "\t" + f.getBody().getNumAddresses()
                        + "\t" + String.join(",", callers) + "\t" + String.join(",", callees));
            }
        }
    }

    private void exportStrings(File out) throws Exception {
        ReferenceManager rm = currentProgram.getReferenceManager();
        try (PrintWriter pw = new PrintWriter(new FileWriter(out))) {
            pw.println("addr\tstring\trefs");
            DataIterator it = currentProgram.getListing().getDefinedData(true);
            while (it.hasNext()) {
                Data d = it.next();
                if (!d.hasStringValue()) continue;
                String s = StringDataInstance.getStringDataInstance(d).getStringValue();
                if (s == null) continue;
                Set<String> refs = new TreeSet<>();
                ReferenceIterator ri = rm.getReferencesTo(d.getAddress());
                while (ri.hasNext()) refs.add(funcAt(ri.next().getFromAddress()));
                pw.println(d.getAddress() + "\t" + s.replace("\t", "\t").replace("\n", "\n").replace("\r", "\r")
                        + "\t" + String.join(",", refs));
            }
        }
    }

    private void exportDataRefs(File out) throws Exception {
        ReferenceManager rm = currentProgram.getReferenceManager();
        try (PrintWriter pw = new PrintWriter(new FileWriter(out))) {
            pw.println("data\tfrom\ttype\tfunc");
            ghidra.program.model.address.AddressIterator ai = rm.getReferenceSourceIterator(currentProgram.getMinAddress(), true);
            while (ai.hasNext()) {
                Address from = ai.next();
                for (Reference r : rm.getReferencesFrom(from)) {
                    RefType t = r.getReferenceType();
                    if (!t.isData()) continue;
                    Address to = r.getToAddress();
                    if (!to.isMemoryAddress()) continue;
                    pw.println(to + "\t" + from + "\t" + t.getName() + "\t" + funcAt(from));
                }
            }
        }
    }

    private void exportDecomp(File out) throws Exception {
        DecompInterface ifc = new DecompInterface();
        DecompileOptions opts = new DecompileOptions();
        ifc.setOptions(opts);
        ifc.toggleCCode(true);
        ifc.toggleSyntaxTree(false);
        ifc.setSimplificationStyle("decompile");
        if (!ifc.openProgram(currentProgram)) {
            throw new RuntimeException("decompiler failed to open: " + ifc.getLastMessage());
        }
        int ok = 0, bad = 0;
        try (PrintWriter pw = new PrintWriter(new FileWriter(out))) {
            FunctionIterator it = currentProgram.getFunctionManager().getFunctions(true);
            while (it.hasNext()) {
                Function f = it.next();
                if (monitor.isCancelled()) break;
                pw.println("// ==== " + f.getName() + " @ " + f.getEntryPoint() + " size " + f.getBody().getNumAddresses() + " ====");
                DecompileResults res = ifc.decompileFunction(f, 180, monitor);
                if (res != null && res.decompileCompleted() && res.getDecompiledFunction() != null) {
                    pw.println(res.getDecompiledFunction().getC());
                    ok++;
                } else {
                    pw.println("// DECOMPILE FAILED: " + (res == null ? "null" : res.getErrorMessage()));
                    bad++;
                }
                pw.println();
            }
        } finally {
            ifc.dispose();
        }
        println("decompiled ok=" + ok + " failed=" + bad);
    }
}
