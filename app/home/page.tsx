'use client';

import React from 'react'
import { useState, useEffect } from 'react'
import Graph from '@/components/home/Graph'
import JobTitleModal from '@/components/home/JobTitleModal';

function page() {
    const [windowSize, setWindowSize] = useState({
        width: window.innerWidth,
        height: window.innerHeight,
    });

    useEffect(() => {
        console.log(windowSize.width, windowSize.height);
    })

    useEffect(() => {
        const handleResize = () => {
            setWindowSize({
                width: window.innerWidth,
                height: window.innerHeight,
            });
        };
        
        window.addEventListener("resize", handleResize);

        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return (
        <div className="canvas-container">
            {/* <div className="absolute w-[30px] h-[30px]"></div> */}
            <Graph width={windowSize.width} height={windowSize.height} />
        </div>
    )
}

export default page