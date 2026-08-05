use std::collections::HashMap;
use std::env;
use std::fs::File;
use std::io::{self, BufRead, BufReader, Write};
use std::process;
use std::time::Instant;

use rayon::prelude::*;
use uasset_ref_extractor::{extract, ExtractInput, ExtractOutput};

struct Args {
    targets: String,
    threads: Option<usize>,
}

fn parse_args() -> Args {
    let mut targets = None;
    let mut threads = None;
    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--targets" => targets = args.next(),
            "--threads" => threads = args.next().and_then(|value| value.parse().ok()),
            _ => {}
        }
    }
    let Some(targets) = targets else {
        eprintln!("usage: uasset-ref-extractor --targets <targets.json> [--threads <n>]");
        process::exit(2);
    };
    Args { targets, threads }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = parse_args();
    let targets: HashMap<String, String> = serde_json::from_reader(File::open(args.targets)?)?;
    let lines: Vec<String> = BufReader::new(io::stdin())
        .lines()
        .collect::<Result<_, _>>()?;
    let records: Vec<ExtractInput> = lines
        .iter()
        .map(|line| serde_json::from_str(line))
        .collect::<Result<_, _>>()?;

    let run = || {
        records
            .par_iter()
            .map(|record| extract(record, &targets))
            .collect::<Vec<ExtractOutput>>()
    };
    let started = Instant::now();
    let outputs = if let Some(threads) = args.threads {
        rayon::ThreadPoolBuilder::new()
            .num_threads(threads.max(1))
            .build()?
            .install(run)
    } else {
        run()
    };
    eprintln!("extract_ms={:.3}", started.elapsed().as_secs_f64() * 1000.0);

    let stdout = io::stdout();
    let mut handle = stdout.lock();
    for output in outputs {
        serde_json::to_writer(&mut handle, &output)?;
        handle.write_all(b"\n")?;
    }
    Ok(())
}
