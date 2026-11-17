'use client';
import {useEffect} from 'react';
import {trackReading} from '@/lib/reading/client';
export function ReadingFilterEvent({lane,source}:{lane:string;source:string}){useEffect(()=>{if(lane!=='all'||source!=='all')void trackReading('filter','feed',{lane});},[lane,source]);return null;}
