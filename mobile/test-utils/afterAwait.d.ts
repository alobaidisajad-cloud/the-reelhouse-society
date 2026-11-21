/** What a function does after it waits, and whether a check stands between; see afterAwait.js. */
import type ts from 'typescript';

/** 'here': true means still here (still the read asked); 'gone': true means left (overtaken). */
export type Check = (e: ts.Expression) => 'here' | 'gone' | null;
export interface WaitingBody { fn: ts.FunctionLikeDeclaration; tail: boolean; waits?: number[] }

export function parse(file: string, text: string): ts.SourceFile;
export function isFn(n: ts.Node): n is ts.FunctionLikeDeclaration;
export function isAsync(n: ts.Node): boolean;
export function waitingBodies(sf: ts.SourceFile): WaitingBody[];
export function ownNodes<T>(fn: ts.FunctionLikeDeclaration, pick: (n: ts.Node) => T | null | undefined | false): T[];
export function lastWaitBefore(body: WaitingBody, pos: number): number;
export function coveredAfter(fn: ts.Node, node: ts.Node, since: number, check: Check): boolean;
export function provesHere(e: ts.Expression, check: Check): boolean;
export function provesWhenFalse(e: ts.Expression, check: Check): boolean;
export function ownerOf(node: ts.Node): ts.FunctionLikeDeclaration | null;
export function lineOf(sf: ts.SourceFile, node: ts.Node): number;
export function namedOwner(node: ts.Node): { node: ts.Node; name: string } | null;
export function outermostOwner(node: ts.Node): { node: ts.Node; name: string } | null;
export function strip(e: ts.Expression): ts.Expression;
