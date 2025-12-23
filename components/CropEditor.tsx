'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { BoundingBox } from '@/lib/imageProcessing';

interface CropEditorProps {
    imageUrl: string;
    initialCrop: BoundingBox;
    imageWidth: number;
    imageHeight: number;
    onCropChange: (crop: BoundingBox) => void;
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * Interactive crop editor component
 * Allows users to adjust the document crop bounds
 */
export default function CropEditor({
    imageUrl,
    initialCrop,
    imageWidth,
    imageHeight,
    onCropChange,
    onConfirm,
    onCancel
}: CropEditorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [crop, setCrop] = useState<BoundingBox>(initialCrop);
    const [isDragging, setIsDragging] = useState(false);
    const [dragHandle, setDragHandle] = useState<string | null>(null);
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(1);

    // Calculate display scale
    useEffect(() => {
        if (containerRef.current) {
            const containerWidth = containerRef.current.clientWidth;
            const newScale = Math.min(1, containerWidth / imageWidth);
            setScale(newScale);
        }
    }, [imageWidth]);

    // Convert screen coordinates to image coordinates
    const screenToImage = useCallback((screenX: number, screenY: number): { x: number; y: number } => {
        if (!containerRef.current) return { x: 0, y: 0 };

        const rect = containerRef.current.getBoundingClientRect();
        const x = (screenX - rect.left) / scale;
        const y = (screenY - rect.top) / scale;

        return {
            x: Math.max(0, Math.min(imageWidth, x)),
            y: Math.max(0, Math.min(imageHeight, y))
        };
    }, [scale, imageWidth, imageHeight]);

    // Handle mouse down on crop handles
    const handleMouseDown = useCallback((e: React.MouseEvent, handle: string) => {
        e.preventDefault();
        setIsDragging(true);
        setDragHandle(handle);
        setStartPos({ x: e.clientX, y: e.clientY });
    }, []);

    // Handle mouse move
    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging || !dragHandle) return;

        const pos = screenToImage(e.clientX, e.clientY);
        const newCrop = { ...crop };

        switch (dragHandle) {
            case 'nw':
                newCrop.width = crop.x + crop.width - pos.x;
                newCrop.height = crop.y + crop.height - pos.y;
                newCrop.x = pos.x;
                newCrop.y = pos.y;
                break;
            case 'ne':
                newCrop.width = pos.x - crop.x;
                newCrop.height = crop.y + crop.height - pos.y;
                newCrop.y = pos.y;
                break;
            case 'sw':
                newCrop.width = crop.x + crop.width - pos.x;
                newCrop.height = pos.y - crop.y;
                newCrop.x = pos.x;
                break;
            case 'se':
                newCrop.width = pos.x - crop.x;
                newCrop.height = pos.y - crop.y;
                break;
            case 'n':
                newCrop.height = crop.y + crop.height - pos.y;
                newCrop.y = pos.y;
                break;
            case 's':
                newCrop.height = pos.y - crop.y;
                break;
            case 'w':
                newCrop.width = crop.x + crop.width - pos.x;
                newCrop.x = pos.x;
                break;
            case 'e':
                newCrop.width = pos.x - crop.x;
                break;
            case 'move':
                const deltaX = (e.clientX - startPos.x) / scale;
                const deltaY = (e.clientY - startPos.y) / scale;
                newCrop.x = Math.max(0, Math.min(imageWidth - crop.width, crop.x + deltaX));
                newCrop.y = Math.max(0, Math.min(imageHeight - crop.height, crop.y + deltaY));
                setStartPos({ x: e.clientX, y: e.clientY });
                break;
        }

        // Ensure minimum size
        newCrop.width = Math.max(50, newCrop.width);
        newCrop.height = Math.max(50, newCrop.height);

        // Keep within bounds
        newCrop.x = Math.max(0, Math.min(imageWidth - newCrop.width, newCrop.x));
        newCrop.y = Math.max(0, Math.min(imageHeight - newCrop.height, newCrop.y));

        setCrop(newCrop);
        onCropChange(newCrop);
    }, [isDragging, dragHandle, crop, startPos, scale, screenToImage, imageWidth, imageHeight, onCropChange]);

    // Handle mouse up
    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        setDragHandle(null);
    }, []);

    // Attach global mouse listeners
    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, handleMouseMove, handleMouseUp]);

    // Reset to full image
    const handleResetCrop = () => {
        const fullCrop = { x: 0, y: 0, width: imageWidth, height: imageHeight };
        setCrop(fullCrop);
        onCropChange(fullCrop);
    };

    return (
        <div className="crop-editor">
            <div className="crop-header">
                <h3>Adjust Crop</h3>
                <button onClick={handleResetCrop} className="btn-reset">Reset</button>
            </div>

            <div
                ref={containerRef}
                className="crop-container"
                style={{
                    width: imageWidth * scale,
                    height: imageHeight * scale,
                    position: 'relative'
                }}
            >
                {/* Base Image (dimmed) */}
                <img
                    src={imageUrl}
                    alt="Document"
                    style={{
                        width: imageWidth * scale,
                        height: imageHeight * scale,
                        opacity: 0.4
                    }}
                    draggable={false}
                />

                {/* Crop Overlay */}
                <div
                    className="crop-overlay"
                    style={{
                        position: 'absolute',
                        left: crop.x * scale,
                        top: crop.y * scale,
                        width: crop.width * scale,
                        height: crop.height * scale,
                        overflow: 'hidden'
                    }}
                    onMouseDown={(e) => handleMouseDown(e, 'move')}
                >
                    <img
                        src={imageUrl}
                        alt="Cropped region"
                        style={{
                            position: 'absolute',
                            left: -crop.x * scale,
                            top: -crop.y * scale,
                            width: imageWidth * scale,
                            height: imageHeight * scale
                        }}
                        draggable={false}
                    />
                </div>

                {/* Crop Border */}
                <div
                    className="crop-border"
                    style={{
                        position: 'absolute',
                        left: crop.x * scale - 2,
                        top: crop.y * scale - 2,
                        width: crop.width * scale + 4,
                        height: crop.height * scale + 4,
                        border: '2px solid #4CAF50',
                        pointerEvents: 'none'
                    }}
                />

                {/* Corner Handles */}
                {['nw', 'ne', 'sw', 'se'].map(handle => (
                    <div
                        key={handle}
                        className={`crop-handle handle-${handle}`}
                        style={{
                            position: 'absolute',
                            width: 16,
                            height: 16,
                            background: '#4CAF50',
                            borderRadius: '50%',
                            cursor: `${handle}-resize`,
                            left: handle.includes('w')
                                ? crop.x * scale - 8
                                : (crop.x + crop.width) * scale - 8,
                            top: handle.includes('n')
                                ? crop.y * scale - 8
                                : (crop.y + crop.height) * scale - 8
                        }}
                        onMouseDown={(e) => handleMouseDown(e, handle)}
                    />
                ))}

                {/* Edge Handles */}
                {['n', 's', 'e', 'w'].map(handle => (
                    <div
                        key={handle}
                        className={`crop-handle handle-${handle}`}
                        style={{
                            position: 'absolute',
                            background: '#4CAF50',
                            borderRadius: 4,
                            cursor: handle === 'n' || handle === 's' ? 'ns-resize' : 'ew-resize',
                            ...(handle === 'n' || handle === 's' ? {
                                width: 32,
                                height: 8,
                                left: (crop.x + crop.width / 2) * scale - 16,
                                top: handle === 'n' ? crop.y * scale - 4 : (crop.y + crop.height) * scale - 4
                            } : {
                                width: 8,
                                height: 32,
                                left: handle === 'w' ? crop.x * scale - 4 : (crop.x + crop.width) * scale - 4,
                                top: (crop.y + crop.height / 2) * scale - 16
                            })
                        }}
                        onMouseDown={(e) => handleMouseDown(e, handle)}
                    />
                ))}
            </div>

            <div className="crop-info">
                <span>Size: {Math.round(crop.width)} × {Math.round(crop.height)}px</span>
            </div>

            <div className="crop-actions">
                <button onClick={onCancel} className="btn-secondary">Cancel</button>
                <button onClick={onConfirm} className="btn-primary">Apply Crop</button>
            </div>

            <style jsx>{`
        .crop-editor {
          background: #1a1a1a;
          border-radius: 12px;
          padding: 16px;
        }

        .crop-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .crop-header h3 {
          margin: 0;
          color: #fff;
        }

        .btn-reset {
          padding: 6px 12px;
          background: #333;
          border: none;
          color: #fff;
          border-radius: 4px;
          cursor: pointer;
        }

        .btn-reset:hover {
          background: #444;
        }

        .crop-container {
          margin: 0 auto;
          background: #000;
          border-radius: 8px;
          overflow: hidden;
        }

        .crop-overlay {
          cursor: move;
        }

        .crop-info {
          text-align: center;
          padding: 12px;
          color: #888;
          font-size: 12px;
        }

        .crop-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }

        .crop-actions button {
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
        }

        .btn-secondary {
          background: #333;
          color: #fff;
        }

        .btn-secondary:hover {
          background: #444;
        }

        .btn-primary {
          background: #4CAF50;
          color: white;
        }

        .btn-primary:hover {
          background: #45a049;
        }
      `}</style>
        </div>
    );
}
