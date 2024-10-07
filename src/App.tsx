import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Upload, Download, Loader2, Captions } from "lucide-react"

export default function AudioExtractor() {
    const [videoFile, setVideoFile] = useState<File | null>(null)
    const [subtitleFile, setSubtitleFile] = useState<File | null>(null)
    const [subtitlesPresent, setSubtitlesPresent] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
    const [showSubtitleDialog, setShowSubtitleDialog] = useState(false)

    const handleVideoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0]

        // if subtitles
        setSubtitlesPresent(true)

        setVideoFile(selectedFile || null)
    }

    const handleSubtitleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0]
        setSubtitleFile(selectedFile || null)
        setShowSubtitleDialog(false)
    }

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault()
        if (!videoFile) return

        setIsProcessing(true)
        // Simulating processing time
        await new Promise((resolve) => setTimeout(resolve, 3000))
        setIsProcessing(false)
        setDownloadUrl("https://example.com/processed-audio.mp3") // Replace with actual URL
    }

    return (
        <div className="max-w-md mx-auto mt-10 p-6 bg-card rounded-lg shadow-lg">
            <h1 className="text-2xl font-bold mb-4 text-center">Audio Extractor for Language Learning</h1>
            <p className="text-muted-foreground mb-6 text-center">
                Upload a TV show or anime episode and get an MP3 with only the spoken dialogue.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="video-upload">Upload Video File</Label>
                    <div className="flex items-center space-x-2">
                        <Input
                            id="video-upload"
                            type="file"
                            accept="video/*"
                            onChange={handleVideoFileChange}
                            className="flex-grow"
                        />
                        <Upload className="text-muted-foreground" />
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        {subtitlesPresent ? `Subtitles detected` : "No subtitles detected"}
                    </p>
                    <Dialog open={showSubtitleDialog} onOpenChange={setShowSubtitleDialog}>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                                <Captions className="mr-2 h-4 w-4" />
                                {subtitleFile ? "Change Subtitle" : "Add Subtitle"}
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Upload Subtitle File</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                                <p className="text-sm text-muted-foreground">
                                    If your video doesn't have embedded subtitles, you can upload a separate subtitle file here.
                                </p>
                                <Input
                                    type="file"
                                    accept=".srt,.vtt,.ass"
                                    onChange={handleSubtitleFileChange}
                                    className="flex-grow"
                                />
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>

                <Button type="submit" className="w-full" disabled={!videoFile || isProcessing}>
                    {isProcessing ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Processing...
                        </>
                    ) : (
                        "Extract Audio"
                    )}
                </Button>
            </form>

            {isProcessing && (
                <div className="mt-4">
                    <Progress value={33} className="w-full" />
                    <p className="text-sm text-muted-foreground mt-2 text-center">Extracting audio...</p>
                </div>
            )}

            {downloadUrl && !isProcessing && (
                <div className="mt-6">
                    <h2 className="text-lg font-semibold mb-2">Your audio is ready!</h2>
                    <Button asChild className="w-full">
                        <a href={downloadUrl} download>
                            <Download className="mr-2 h-4 w-4" />
                            Download MP3
                        </a>
                    </Button>
                </div>
            )}

            <div className="mt-6 text-sm text-muted-foreground">
                <h3 className="font-semibold mb-2">How it works:</h3>
                <ol className="list-decimal list-inside space-y-1">
                    <li>Upload a video file (TV show or anime episode)</li>
                    <li>Optionally upload a subtitle file if not embedded in the video</li>
                    <li>Our system extracts only the spoken dialogue</li>
                    <li>Download the condensed audio file for language learning</li>
                </ol>
            </div>
        </div>
    )
}