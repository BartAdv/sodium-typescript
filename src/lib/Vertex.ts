import { Set } from "typescript-collections";

let totalRegistrations : number = 0;
export function getTotalRegistrations() : number {
    return totalRegistrations;
}

export class Source {
    constructor(
        origin : Vertex,
        register_ : () => () => void
    ) {
        if (origin === null)
            throw new Error("null origin!");
        this.origin = origin;
        this.register_ = register_;
    }
    origin : Vertex;
    private register_ : () => () => void;
    private registered : boolean = false;
    private deregister_ : () => void = null;

    register(target : Vertex) : void {
        if (!this.registered) {
            this.registered = true;
            if (this.register_ !== null)
                this.deregister_ = this.register_();
            else {
                this.origin.increment(target);
                this.deregister_ = () => this.origin.decrement(target);
            }
        }
    }
    deregister(target : Vertex) : void {
        if (this.registered) {
            this.registered = false;
            if (this.deregister_ !== null)
                this.deregister_();
        }
    }
}

export enum Color { black, gray, white, purple };
let roots : Vertex[] = [];
let nextID : number = 0;
let verbose : boolean = false;

export function setVerbose(v : boolean) : void { verbose = v; }

export function describeAll(v : Vertex, visited : Set<number>)
{
    if (visited.contains(v.id)) return;
    console.log(v.descr());
    visited.add(v.id);
    let chs = v.children();
    for (let i = 0; i < chs.length; i++)
        describeAll(chs[i], visited);
}

export class Vertex {
    static NULL : Vertex = new Vertex("user", 1e12, []);
    id : number;

	constructor(name : string, rank : number, sources : Source[]) {
	    this.name = name;
		this.rank = rank;
		this.sources = sources;
		this.id = nextID++;
	}
	name : string;
    rank : number;
    sources : Source[];
    targets : Vertex[] = [];
    childrn : Vertex[] = [];
    refCount() : number { return this.targets.length; };
    visited : boolean = false;
    register(target : Vertex) : boolean {
        return this.increment(target);
    }
    deregister(target : Vertex) : void {
        if (verbose)
            console.log("deregister "+this.descr()+" => "+target.descr());
        this.decrement(target);
        Vertex.collectCycles();
    }
    private incRefCount(target : Vertex) : boolean {
        let anyChanged : boolean = false;
        if (this.refCount() == 0) {
            for (let i = 0; i < this.sources.length; i++)
                this.sources[i].register(this);
        }
        this.targets.push(target);
        target.childrn.push(this);
        if (target.ensureBiggerThan(this.rank))
            anyChanged = true;
        totalRegistrations++;
        return anyChanged;
    }

    private decRefCount(target : Vertex) : void {
        if (verbose)
            console.log("DEC "+this.descr());
        let matched = false;
        for (let i = 0; i < target.childrn.length; i++)
            if (target.childrn[i] === this) {
                target.childrn.splice(i, 1);
            }
        for (let i = 0; i < this.targets.length; i++)
            if (this.targets[i] === target) {
                this.targets.splice(i, 1);
                matched = true;
                break;
            }
        if (matched) {
            if (this.refCount() == 0) {
                for (let i = 0; i < this.sources.length; i++)
                    this.sources[i].deregister(this);
            }
            totalRegistrations--;
        }
    }

    addSource(src : Source) : void {
        this.sources.push(src);
        if (this.refCount() > 0)
            src.register(this);
    }

	private ensureBiggerThan(limit : number) : boolean {
		if (this.rank > limit || this.visited)
			return false;

        this.visited = true;
		this.rank = limit + 1;
		for (let i = 0; i < this.targets.length; i++)
			this.targets[i].ensureBiggerThan(this.rank);
        this.visited = false;
		return true;
	}

	descr() : string {
        let colStr : string = null;
        switch (this.color) {
        case Color.black: colStr = "black"; break;
        case Color.gray:  colStr = "gray"; break;
        case Color.white: colStr = "white"; break;
        case Color.purple: colStr = "purple"; break;
        }
        let str = this.id+" "+this.name+" ["+this.refCount()+"/"+this.refCountAdj+"] "+colStr+" ->";
        let chs = this.children();
        for (let i = 0; i < chs.length; i++) {
            str = str + " " + chs[i].id;
        }
        return str;
	}

	// --------------------------------------------------------
	// Synchronous Cycle Collection algorithm presented in "Concurrent
	// Cycle Collection in Reference Counted Systems" by David F. Bacon
	// and V.T. Rajan.

    color : Color = Color.black;
    buffered : boolean = false;
    refCountAdj : number = 0;

	children() : Vertex[] { return this.childrn; }

	increment(referrer : Vertex) : boolean {
	    return this.incRefCount(referrer);
	}

	decrement(referrer : Vertex) : void {
	    this.decRefCount(referrer);
	    if (this.refCount() == 0)
	        this.release();
        else
            this.possibleRoots();
	}

    release() : void {
        this.color = Color.black;
        if (!this.buffered)
            this.free();
    }

    free() : void {
        while (this.targets.length > 0)
            this.decRefCount(this.targets[0]);
    }

	possibleRoots() : void {
	    if (this.color != Color.purple) {
	        this.color = Color.purple;
	        if (!this.buffered) {
                this.buffered = true;
                roots.push(this);
            }
        }
	}

	static collectCycles() : void {
	    Vertex.markRoots();
	    Vertex.scanRoots();
	    Vertex.collectRoots();
	}

	static markRoots() : void {
	    const newRoots : Vertex[] = [];
	    for (let i = 0; i < roots.length; i++) {
            if (verbose)
                console.log("markRoots "+roots[i].descr());  // ###
	        if (roots[i].color == Color.purple) {
	            roots[i].markGray();
	            newRoots.push(roots[i]);
            }
	        else {
	            roots[i].buffered = false;
	            if (roots[i].color == Color.black && roots[i].refCount() == 0)
	                roots[i].free();
            }
	    }
	    roots = newRoots;
	}

	static scanRoots() : void {
	    for (let i = 0; i < roots.length; i++)
	        roots[i].scan();
	}

	static collectRoots() : void {
	    for (let i = 0; i < roots.length; i++) {
	        roots[i].buffered = false;
	        roots[i].collectWhite();
	    }
	    roots = [];
	}

	markGray() : void {
	    if (this.color != Color.gray) {
	        this.color = Color.gray;
	        let chs = this.children();
	        for (let i = 0; i < chs.length; i++) {
	            chs[i].refCountAdj--;
                if (verbose)
                    console.log("markGray "+this.descr());
	            chs[i].markGray();
            }
	    }
	}

	scan() : void {
	    if (verbose)
            console.log("scan "+this.descr());
	    if (this.color == Color.gray) {
	        if (this.refCount()+this.refCountAdj > 0)
	            this.scanBlack();
	        else {
	            this.color = Color.white;
                if (verbose)
                    console.log("scan WHITE "+this.descr());
                let chs = this.children();
                for (let i = 0; i < chs.length; i++)
                    chs[i].scan();
	        }
	    }
	}

	scanBlack() : void {
	    this.color = Color.black;
        let chs = this.children();
        for (let i = 0; i < chs.length; i++) {
            chs[i].refCountAdj++;
            if (verbose)
                console.log("scanBlack "+this.descr());
            if (chs[i].color != Color.black)
                chs[i].scanBlack();
        }
	}

	collectWhite() : void {
	    if (this.color == Color.white && !this.buffered) {
            if (verbose)
                console.log("collectWhite "+this.descr());
	        this.color = Color.black;
	        this.refCountAdj = 0;
            let chs = this.children();
            for (let i = 0; i < chs.length; i++)
                chs[i].collectWhite();
            this.free();
	    }
	}
}
